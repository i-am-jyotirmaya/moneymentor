using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class GoalPlan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GoalId { get; set; }

    public Guid CreatedByUserProfileId { get; set; }

    public Guid? ActiveVersionId { get; set; }

    public GoalPlanStatus Status { get; set; } = GoalPlanStatus.Draft;

    public string? LastActivationIdempotencyKey { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
