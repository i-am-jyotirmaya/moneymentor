using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Registration;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Email;

internal sealed class InvitationEmailDispatcher(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    TimeProvider timeProvider,
    ILogger<InvitationEmailDispatcher> logger) : BackgroundService
{
    private const string DispatcherIntervalKey = "Resend:DispatcherInterval";
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromMinutes(1),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(30),
        TimeSpan.FromHours(2),
        TimeSpan.FromHours(12)
    ];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await DispatchAvailableAsync(stoppingToken);
        var dispatcherInterval = configuration.GetValue<TimeSpan?>(DispatcherIntervalKey)
            ?? TimeSpan.FromSeconds(15);
        using var timer = new PeriodicTimer(dispatcherInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await DispatchAvailableAsync(stoppingToken);
        }
    }

    internal async Task DispatchAvailableAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var invitationId = await ClaimAsync(cancellationToken);
            if (invitationId is null)
            {
                return;
            }

            try
            {
                await DeliverAsync(invitationId.Value, cancellationToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(
                    exception,
                    "Invitation dispatch failed unexpectedly for invitation {InvitationId}; the lease will make it retryable.",
                    invitationId.Value);
            }
        }
    }

    private async Task<Guid?> ClaimAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var now = timeProvider.GetUtcNow();
        await dbContext.HouseholdInvitations
            .Where(invitation => invitation.Status == HouseholdInvitationStatus.Pending
                && invitation.ExpiresAt <= now)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(invitation => invitation.Status, HouseholdInvitationStatus.Expired)
                    .SetProperty(invitation => invitation.NextDeliveryAttemptAt, (DateTimeOffset?)null)
                    .SetProperty(invitation => invitation.DeliveryLeaseUntil, (DateTimeOffset?)null),
                cancellationToken);
        var invitation = await dbContext.HouseholdInvitations
            .FromSqlInterpolated($"""
                SELECT * FROM app.household_invitations
                WHERE "Status" = 'Pending'
                  AND ("DeliveryStatus" = 'Queued' OR "DeliveryStatus" = 'Failed' OR ("DeliveryStatus" = 'Processing' AND "DeliveryLeaseUntil" <= {now}))
                  AND ("NextDeliveryAttemptAt" IS NULL OR "NextDeliveryAttemptAt" <= {now})
                  AND "DeliveryAttemptCount" < 6
                ORDER BY "CreatedAt"
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """)
            .SingleOrDefaultAsync(cancellationToken);
        if (invitation is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return null;
        }

        invitation.DeliveryStatus = InvitationDeliveryStatus.Processing;
        invitation.DeliveryLeaseUntil = now.AddMinutes(2);
        invitation.DeliveryAttemptCount++;
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return invitation.Id;
    }

    private async Task DeliverAsync(Guid invitationId, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var sender = scope.ServiceProvider.GetRequiredService<ITransactionalEmailSender>();
        var invitation = await dbContext.HouseholdInvitations.FirstAsync(
            item => item.Id == invitationId,
            cancellationToken);
        var household = await dbContext.Households.AsNoTracking().FirstAsync(
            item => item.Id == invitation.HouseholdId,
            cancellationToken);
        var inviter = await dbContext.UserProfiles.AsNoTracking().FirstAsync(
            item => item.Id == invitation.InvitedByUserProfileId,
            cancellationToken);
        var publicWebUrl = configuration["Product:PublicWebUrl"]?.TrimEnd('/')
            ?? "http://localhost:3000";
        var registration = scope.ServiceProvider.GetRequiredService<IOptions<RegistrationOptions>>().Value;
        var signupUrl = registration.IsOpen
            ? $"{publicWebUrl}/signup?invite={invitation.Id}"
            : $"{publicWebUrl}/request-access";
        var signupLabel = registration.IsOpen ? "Create an account" : "Request MVP access";
        var approvalNote = registration.IsOpen ? "" : " New accounts require MVP approval before accepting this household invitation.";
        var loginUrl = $"{publicWebUrl}/login?invite={invitation.Id}";
        var text = $"{inviter.DisplayName} invited you to {household.Name} as {invitation.Role}. {signupLabel}: {signupUrl} or sign in: {loginUrl}.{approvalNote}";
        var html = $"<p><strong>{WebUtility.HtmlEncode(inviter.DisplayName)}</strong> invited you to <strong>{WebUtility.HtmlEncode(household.Name)}</strong> as {invitation.Role}.</p><p><a href=\"{WebUtility.HtmlEncode(signupUrl)}\">{signupLabel}</a> or <a href=\"{WebUtility.HtmlEncode(loginUrl)}\">sign in</a>.{approvalNote}</p>";
        EmailSendResult result;
        try
        {
            result = await sender.SendAsync(
                new TransactionalEmailMessage(
                    invitation.DeliveryId,
                    invitation.Email,
                    $"Invitation to {household.Name}",
                    text,
                    html),
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Invitation email provider failed unexpectedly for invitation {InvitationId}.", invitation.Id);
            result = EmailSendResult.Failure("The email provider failed unexpectedly.");
        }

        var now = timeProvider.GetUtcNow();
        invitation.DeliveryLeaseUntil = null;
        if (result.Succeeded)
        {
            MoneyMentorTelemetry.InvitationDeliveries.Add(
                1,
                new KeyValuePair<string, object?>("outcome", "sent"));
            invitation.DeliveryStatus = InvitationDeliveryStatus.Sent;
            invitation.ProviderMessageId = result.ProviderMessageId;
            invitation.SentAt = now;
            invitation.LastDeliveryError = null;
            invitation.NextDeliveryAttemptAt = null;
        }
        else
        {
            MoneyMentorTelemetry.InvitationDeliveries.Add(
                1,
                new KeyValuePair<string, object?>("outcome", "failed"));
            invitation.DeliveryStatus = InvitationDeliveryStatus.Failed;
            invitation.LastDeliveryError = result.Error;
            invitation.NextDeliveryAttemptAt = invitation.DeliveryAttemptCount <= RetryDelays.Length
                ? now.Add(RetryDelays[invitation.DeliveryAttemptCount - 1])
                : null;
            logger.LogWarning(
                "Invitation email delivery failed for invitation {InvitationId} on attempt {AttemptCount}.",
                invitation.Id,
                invitation.DeliveryAttemptCount);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
