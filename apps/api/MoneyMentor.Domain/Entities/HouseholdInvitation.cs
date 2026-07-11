using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class HouseholdInvitation
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public Guid InvitedByUserProfileId { get; set; }

    public Guid? RespondedByUserProfileId { get; set; }

    public string Email { get; set; } = string.Empty;

    public HouseholdRole Role { get; set; } = HouseholdRole.Member;

    public HouseholdInvitationStatus Status { get; set; } = HouseholdInvitationStatus.Pending;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RespondedAt { get; set; }

    public Guid DeliveryId { get; set; } = Guid.NewGuid();

    public InvitationDeliveryStatus DeliveryStatus { get; set; } = InvitationDeliveryStatus.Queued;

    public int DeliveryAttemptCount { get; set; }

    public DateTimeOffset? NextDeliveryAttemptAt { get; set; }

    public DateTimeOffset? DeliveryLeaseUntil { get; set; }

    public DateTimeOffset? SentAt { get; set; }

    public string? ProviderMessageId { get; set; }

    public string? LastDeliveryError { get; set; }
}
