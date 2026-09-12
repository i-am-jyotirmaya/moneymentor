using System.Net;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Registration;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Auth;

internal sealed class PostgresMvpAccessService(
    MoneyMentorAuthDbContext dbContext,
    ILookupNormalizer normalizer,
    ITransactionalEmailSender sender,
    IConfiguration configuration,
    TimeProvider clock) : IMvpAccessService
{
    public async Task RequestAsync(string name, string email, string? reason, CancellationToken cancellationToken)
    {
        email = email.Trim();
        var normalizedEmail = normalizer.NormalizeEmail(email);
        // One insert handles concurrent duplicates without changing a previous review.
        var id = Guid.NewGuid();
        var now = clock.GetUtcNow();
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO auth.mvp_access_requests
                ("Id", "Name", "Email", "NormalizedEmail", "Reason", "Status", "RequestedAt")
            SELECT {id}, {name.Trim()}, {email}, {normalizedEmail}, {reason?.Trim()}, 'Pending', {now}
            WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE "NormalizedEmail" = {normalizedEmail})
            ON CONFLICT ("NormalizedEmail") DO NOTHING
            """, cancellationToken);
    }

    public async Task<SignupInvitation?> ValidateAsync(string token, CancellationToken cancellationToken)
    {
        var hash = MvpInvitationToken.Hash(token);
        var now = clock.GetUtcNow();
        return await dbContext.MvpAccessRequests.AsNoTracking()
            .Where(item => item.TokenHash == hash && item.Status == "Approved" && item.ExpiresAt > now)
            .Select(item => new SignupInvitation(item.Name, item.Email))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MvpAccessRequestSummary>> ListAsync(string status, CancellationToken cancellationToken)
    {
        var normalizedStatus = status.ToLowerInvariant() switch
        {
            "pending" => "Pending", "approved" => "Approved", "rejected" => "Rejected",
            "registered" => "Registered", "all" => null,
            _ => throw new ArgumentException("Status must be pending, approved, rejected, registered, or all.")
        };
        return await dbContext.MvpAccessRequests.AsNoTracking()
            .Where(item => normalizedStatus == null || item.Status == normalizedStatus)
            .OrderBy(item => item.RequestedAt)
            .Select(item => new MvpAccessRequestSummary(item.Id, item.Name, item.Email, item.Reason,
                item.Status, item.RequestedAt, item.ReviewedBy, item.ReviewedAt, item.ExpiresAt,
                item.DeliveryStatus, item.LastDeliveryError))
            .ToListAsync(cancellationToken);
    }

    public async Task ReviewAsync(Guid id, string action, string operatorName, CancellationToken cancellationToken)
    {
        if (action is not ("approve" or "reject" or "resend"))
            throw new ArgumentException("Action must be approve, reject, or resend.");
        if (string.IsNullOrWhiteSpace(operatorName) || operatorName.Trim().Length > 128)
            throw new ArgumentException("Provide an operator name of at most 128 characters.");

        string? token = null;
        string? publicWebUrl = null;
        if (action != "reject")
        {
            publicWebUrl = configuration["Product:PublicWebUrl"]?.TrimEnd('/');
            if (!Uri.TryCreate(publicWebUrl, UriKind.Absolute, out var uri)
                || (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback)))
                throw new InvalidOperationException("Configure Product:PublicWebUrl with the HTTPS app URL before approving requests.");
        }

        MvpAccessRequest request;
        await using (var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken))
        {
            request = await dbContext.MvpAccessRequests
                .FromSqlInterpolated($"SELECT * FROM auth.mvp_access_requests WHERE \"Id\" = {id} FOR UPDATE")
                .SingleOrDefaultAsync(cancellationToken)
                ?? throw new InvalidOperationException("Access request not found.");
            if (request.Status == "Registered")
                throw new InvalidOperationException("This request has already been used to create an account.");
            if (action == "approve" && request.Status == "Approved")
                throw new InvalidOperationException("Already approved. Use resend to replace and email the signup link.");
            if (action == "resend" && request.Status != "Approved")
                throw new InvalidOperationException("Only approved requests can be resent.");
            if (action != "reject" && await dbContext.Users.AnyAsync(
                    user => user.NormalizedEmail == request.NormalizedEmail, cancellationToken))
                throw new InvalidOperationException("An account already exists for this email; the user should sign in.");

            request.ReviewedBy = operatorName.Trim();
            request.ReviewedAt = clock.GetUtcNow();
            request.Status = action == "reject" ? "Rejected" : "Approved";
            request.TokenHash = null;
            request.ExpiresAt = null;
            if (action != "reject")
            {
                token = MvpInvitationToken.Create();
                request.TokenHash = MvpInvitationToken.Hash(token);
                request.ExpiresAt = clock.GetUtcNow().AddDays(7);
                request.DeliveryId = Guid.NewGuid();
                request.DeliveryStatus = "Pending";
                request.LastDeliveryError = null;
                request.ProviderMessageId = null;
                request.SentAt = null;
            }
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        if (token is null) return;

        var deliveryId = request.DeliveryId!.Value;
        var signupUrl = $"{publicWebUrl}/signup#token={token}";
        EmailSendResult delivery;
        try
        {
            delivery = await sender.SendAsync(new TransactionalEmailMessage(
                deliveryId, request.Email, "Your Spndrr MVP access is approved",
                $"Hi {request.Name}, your MVP access is approved. Create your account: {signupUrl}\nThis private link can be used once and expires in seven days. If you did not request access, ignore this email.",
                $"<p>Hi {WebUtility.HtmlEncode(request.Name)}, your MVP access is approved.</p><p><a href=\"{WebUtility.HtmlEncode(signupUrl)}\">Create your account</a></p><p>This private link can be used once and expires in seven days. If you did not request access, ignore this email.</p>"),
                cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Do not expose provider exceptions that might contain the private link.
            delivery = EmailSendResult.Failure("The email provider failed unexpectedly.");
        }

        // A concurrent resend must not be overwritten by an older delivery result.
        await dbContext.MvpAccessRequests.Where(item => item.Id == id && item.DeliveryId == deliveryId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.DeliveryStatus, delivery.Succeeded ? "Sent" : "Failed")
                .SetProperty(item => item.ProviderMessageId, delivery.ProviderMessageId)
                .SetProperty(item => item.LastDeliveryError, delivery.Error)
                .SetProperty(item => item.SentAt, delivery.Succeeded ? clock.GetUtcNow() : (DateTimeOffset?)null), cancellationToken);
        if (!delivery.Succeeded)
            throw new InvalidOperationException($"Approval saved, but email delivery failed: {delivery.Error} Use access-requests resend to retry.");
    }
}
