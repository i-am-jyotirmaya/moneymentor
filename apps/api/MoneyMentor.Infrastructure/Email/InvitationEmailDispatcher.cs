using MoneyMentor.Infrastructure.Logging;
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
    IOptions<ResendOptions> options,
    IInvitationDispatchSignal dispatchSignal,
    TimeProvider timeProvider,
    ILogger<InvitationEmailDispatcher> logger) : BackgroundService
{
    private static readonly TimeSpan DeliveryLease = TimeSpan.FromMinutes(2);
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
        using var workerScope = logger.BeginJobRun(nameof(InvitationEmailDispatcher));
        DateTimeOffset? nextScheduledAttempt = null;

        while (!stoppingToken.IsCancellationRequested)
        {
            if (nextScheduledAttempt is { } dueAttempt
                && dueAttempt <= timeProvider.GetUtcNow())
            {
                nextScheduledAttempt = null;
            }

            var discoveredAttempt = await DispatchAvailableAsync(stoppingToken);
            nextScheduledAttempt = Earlier(nextScheduledAttempt, discoveredAttempt);

            var now = timeProvider.GetUtcNow();
            var wait = options.Value.RecoveryInterval;
            if (nextScheduledAttempt is { } scheduledAttempt)
            {
                wait = Min(wait, scheduledAttempt - now);
            }

            await WaitForWorkAsync(wait, stoppingToken);
        }
    }

    internal async Task<DateTimeOffset?> DispatchAvailableAsync(CancellationToken cancellationToken)
    {
        DateTimeOffset? nextScheduledAttempt = null;
        while (!cancellationToken.IsCancellationRequested)
        {
            using var runScope = logger.BeginJobRun(nameof(InvitationEmailDispatcher));
            var claim = await ClaimAsync(cancellationToken);
            if (claim is null)
            {
                var persistedAttempt = await FindNextScheduledAttemptAsync(cancellationToken);
                return Earlier(nextScheduledAttempt, persistedAttempt);
            }

            using var itemScope = logger.BeginScope(new Dictionary<string, object?>
            {
                ["InvitationId"] = claim.InvitationId
            });
            try
            {
                var retryAt = await DeliverAsync(claim.InvitationId, cancellationToken);
                nextScheduledAttempt = Earlier(nextScheduledAttempt, retryAt);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(
                    exception,
                    "Invitation dispatch failed unexpectedly for invitation {InvitationId}; the lease will make it retryable.",
                    claim.InvitationId);
                nextScheduledAttempt = Earlier(nextScheduledAttempt, claim.LeaseUntil);
            }
        }

        return nextScheduledAttempt;
    }

    private async Task<InvitationClaim?> ClaimAsync(CancellationToken cancellationToken)
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
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        var leaseUntil = now.Add(DeliveryLease);
        invitation.DeliveryStatus = InvitationDeliveryStatus.Processing;
        invitation.DeliveryLeaseUntil = leaseUntil;
        invitation.DeliveryAttemptCount++;
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new InvitationClaim(invitation.Id, leaseUntil);
    }

    private async Task<DateTimeOffset?> FindNextScheduledAttemptAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var now = timeProvider.GetUtcNow();

        return await dbContext.HouseholdInvitations
            .Where(invitation => invitation.Status == HouseholdInvitationStatus.Pending
                && invitation.DeliveryAttemptCount < 6
                && (invitation.DeliveryStatus == InvitationDeliveryStatus.Processing
                    && invitation.DeliveryLeaseUntil > now
                    || (invitation.DeliveryStatus == InvitationDeliveryStatus.Queued
                            || invitation.DeliveryStatus == InvitationDeliveryStatus.Failed)
                        && invitation.NextDeliveryAttemptAt > now))
            .Select(invitation => invitation.DeliveryStatus == InvitationDeliveryStatus.Processing
                ? invitation.DeliveryLeaseUntil
                : invitation.NextDeliveryAttemptAt)
            .MinAsync(cancellationToken);
    }

    private async Task<DateTimeOffset?> DeliverAsync(Guid invitationId, CancellationToken cancellationToken)
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
        return invitation.NextDeliveryAttemptAt;
    }

    private async Task WaitForWorkAsync(TimeSpan wait, CancellationToken stoppingToken)
    {
        wait = wait <= TimeSpan.Zero ? TimeSpan.Zero : wait;
        using var waitCancellation = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        var signalTask = dispatchSignal.WaitAsync(waitCancellation.Token).AsTask();
        var timerTask = Task.Delay(wait, timeProvider, waitCancellation.Token);
        await Task.WhenAny(signalTask, timerTask);
        await waitCancellation.CancelAsync();

        try
        {
            await Task.WhenAll(signalTask, timerTask);
        }
        catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
        {
            // The losing wait is intentionally cancelled.
        }

    }

    private static TimeSpan Min(TimeSpan left, TimeSpan right) => left <= right ? left : right;

    private static DateTimeOffset? Earlier(DateTimeOffset? left, DateTimeOffset? right)
    {
        if (left is null)
        {
            return right;
        }

        if (right is null)
        {
            return left;
        }

        return left <= right ? left : right;
    }

    private sealed record InvitationClaim(Guid InvitationId, DateTimeOffset LeaseUntil);
}
