using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class GoalPlanOption
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GoalPlanVersionId { get; set; }

    public int SortOrder { get; set; }

    public GoalPlanPace Pace { get; set; }

    public decimal MonthlyContribution { get; set; }

    public DateOnly ProjectedCompletionDate { get; set; }

    public GoalPlanFeasibility Feasibility { get; set; }

    public bool IsRecommended { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Explanation { get; set; } = string.Empty;

    public string TradeOffsJson { get; set; } = "[]";

    public string AssumptionsJson { get; set; } = "[]";

    public string RisksJson { get; set; } = "[]";

    public string MilestonesJson { get; set; } = "[]";

    public string CalculationVersion { get; set; } = string.Empty;
}
