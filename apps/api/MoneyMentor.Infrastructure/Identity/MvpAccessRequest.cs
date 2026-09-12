namespace MoneyMentor.Infrastructure.Identity;

public sealed class MvpAccessRequest
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string NormalizedEmail { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTimeOffset RequestedAt { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? TokenHash { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? RegisteredAt { get; set; }
    public Guid? DeliveryId { get; set; }
    public string? DeliveryStatus { get; set; }
    public string? ProviderMessageId { get; set; }
    public string? LastDeliveryError { get; set; }
    public DateTimeOffset? SentAt { get; set; }
}
