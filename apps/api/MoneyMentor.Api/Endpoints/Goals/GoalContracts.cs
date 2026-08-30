using System.ComponentModel.DataAnnotations;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Goals;

public sealed class CreateGoalRequest
{
    public Guid? HouseholdId { get; init; }

    [Required]
    [MaxLength(128)]
    public string Name { get; init; } = string.Empty;

    public FinancialGoalType GoalType { get; init; } = FinancialGoalType.Saving;

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal TargetAmount { get; init; }

    public DateOnly? TargetDate { get; init; }

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? MonthlyTarget { get; init; }

    public FinancialGoalPriority Priority { get; init; } = FinancialGoalPriority.Medium;

    public bool IsShared { get; init; }
}

public sealed class UpdateGoalRequest
{
    [MaxLength(128)]
    public string? Name { get; init; }

    public FinancialGoalType? GoalType { get; init; }

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? TargetAmount { get; init; }

    public DateOnly? TargetDate { get; init; }

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? MonthlyTarget { get; init; }

    public FinancialGoalPriority? Priority { get; init; }

    public FinancialGoalStatus? Status { get; init; }
}

public sealed class CreateGoalContributionRequest
{
    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal Amount { get; init; }

    public DateOnly? ContributedAt { get; init; }

    public GoalContributionSource Source { get; init; } = GoalContributionSource.Manual;

    public Guid? TransactionId { get; init; }

    public Guid? CommitmentId { get; init; }
}

public sealed class CreateGoalPlanningRunRequest
{
    public GoalPlanPace? Pace { get; init; }

    public DateOnly? TargetDate { get; init; }

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? MonthlyContribution { get; init; }

    public IReadOnlyCollection<Guid> ParticipantUserProfileIds { get; init; } = [];

    [MaxLength(20)]
    public string? Locale { get; init; }
}

public sealed class CustomizeGoalPlanRequest
{
    public GoalPlanPace Pace { get; init; } = GoalPlanPace.Custom;

    public DateOnly? TargetDate { get; init; }

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? MonthlyContribution { get; init; }

    [MaxLength(1000)]
    public string? Context { get; init; }
}

public sealed class ReviewGoalPlanRequest
{
    [MaxLength(20)]
    public string? Locale { get; init; }
}
