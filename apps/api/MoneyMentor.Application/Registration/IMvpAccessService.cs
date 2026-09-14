namespace MoneyMentor.Application.Registration;

public interface IMvpAccessService
{
    Task RequestAsync(string name, string email, string? reason, CancellationToken cancellationToken);
    Task<SignupInvitation?> ValidateAsync(string token, CancellationToken cancellationToken);
    Task<IReadOnlyList<MvpAccessRequestSummary>> ListAsync(string status, CancellationToken cancellationToken);
    Task ReviewAsync(Guid id, string action, string operatorName, CancellationToken cancellationToken);
}

public sealed record SignupInvitation(string Name, string Email);

public sealed record MvpAccessRequestSummary(
    Guid Id, string Name, string Email, string? Reason, string Status,
    DateTimeOffset RequestedAt, string? ReviewedBy, DateTimeOffset? ReviewedAt,
    DateTimeOffset? ExpiresAt, string? DeliveryStatus, string? LastDeliveryError);
