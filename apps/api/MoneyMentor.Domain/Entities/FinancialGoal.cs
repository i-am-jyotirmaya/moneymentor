using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class FinancialGoal
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public Guid? UserProfileId { get; set; }

    public Guid CreatedByUserProfileId { get; set; }

    public string Name { get; set; } = string.Empty;

    public FinancialGoalType GoalType { get; set; } = FinancialGoalType.Saving;

    public decimal TargetAmount { get; set; }

    public decimal CurrentAmount { get; set; }

    public DateOnly? TargetDate { get; set; }

    public decimal? MonthlyTarget { get; set; }

    public FinancialGoalPriority Priority { get; set; }

    public FinancialGoalStatus Status { get; set; }

    public DateTimeOffset? AchievedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
