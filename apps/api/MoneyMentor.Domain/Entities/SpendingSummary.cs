using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class SpendingSummary
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public Guid? UserProfileId { get; set; }

    public JudgementReportScope Scope { get; set; }

    public JudgementReportCadence Cadence { get; set; }

    public DateOnly WindowStart { get; set; }

    public DateOnly WindowEndExclusive { get; set; }

    public string TimeZone { get; set; } = string.Empty;

    public string CurrencyCode { get; set; } = string.Empty;

    public int Revision { get; set; } = 1;

    public string CalculationVersion { get; set; } = string.Empty;

    public SpendingSummaryStatus Status { get; set; } = SpendingSummaryStatus.Calculated;

    public JudgementReportDirection Direction { get; set; } = JudgementReportDirection.InsufficientData;

    public JudgementDataConfidence Confidence { get; set; } = JudgementDataConfidence.Low;

    public decimal Income { get; set; }

    public decimal ExplicitSavings { get; set; }

    public decimal ConsumptionSpend { get; set; }

    public decimal EssentialSpend { get; set; }

    public decimal DiscretionarySpend { get; set; }

    public decimal DebtSpend { get; set; }

    public decimal UncategorizedSpend { get; set; }

    public decimal CashOutflow { get; set; }

    public decimal OperatingSurplus { get; set; }

    public decimal CashBalance { get; set; }

    public decimal? SavingsRate { get; set; }

    public decimal? SavingsAllocationRate { get; set; }

    public decimal? ExpenseToIncomeRate { get; set; }

    public decimal? EssentialShare { get; set; }

    public decimal? DiscretionaryShare { get; set; }

    public decimal? DebtShare { get; set; }

    public decimal? UncategorizedShare { get; set; }

    public int TransactionCount { get; set; }

    public int ExpenseTransactionCount { get; set; }

    public int IncomeTransactionCount { get; set; }

    public int InvestmentTransactionCount { get; set; }

    public int TransferTransactionCount { get; set; }

    public int CategorizedTransactionCount { get; set; }

    public int UncategorizedTransactionCount { get; set; }

    public int ActiveTransactionDays { get; set; }

    public DateOnly? FirstTransactionDate { get; set; }

    public DateOnly? LastTransactionDate { get; set; }

    public Guid? PreviousSummaryId { get; set; }

    public int BaselinePeriodCount { get; set; }

    public int RequiredBaselinePeriodCount { get; set; }

    public string MetricsComparisonJson { get; set; } = "{}";

    public string DataQualityFlagsJson { get; set; } = "[]";

    public string GoalInputsJson { get; set; } = "{}";

    public string RuleVersion { get; set; } = string.Empty;

    public NarrationStatus NarrationStatus { get; set; } = NarrationStatus.NotRequested;

    public string? NarrationHeadline { get; set; }

    public string? NarrationOverview { get; set; }

    public string? NarrationJson { get; set; }

    public string? NarrationModel { get; set; }

    public bool IsDeterministicFallback { get; set; }

    public DateTimeOffset CalculatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? NarratedAt { get; set; }

    public DateTimeOffset? PublishedAt { get; set; }
}
