using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class EntitlementChange
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserProfileId { get; set; }

    public UserPlan PreviousPlan { get; set; }

    public UserPlan NewPlan { get; set; }

    public string Operator { get; set; } = string.Empty;

    public string Reason { get; set; } = string.Empty;

    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
}
