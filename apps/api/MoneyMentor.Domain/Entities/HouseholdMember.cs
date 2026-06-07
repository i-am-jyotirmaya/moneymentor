using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class HouseholdMember
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public Guid UserProfileId { get; set; }

    public HouseholdRole Role { get; set; }

    public HouseholdMemberStatus Status { get; set; }

    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;
}
