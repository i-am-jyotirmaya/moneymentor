using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class GoalPlanVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GoalPlanId { get; set; }

    public Guid? SourceVersionId { get; set; }

    public Guid CreatedByUserProfileId { get; set; }

    public int VersionNumber { get; set; }

    public GoalPlanVersionSource Source { get; set; }

    public string? UserContext { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
