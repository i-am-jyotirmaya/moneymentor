using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public enum SummaryMetricCode
{
    Income,
    ExplicitSavings,
    ConsumptionSpend,
    EssentialSpend,
    DiscretionarySpend,
    DebtSpend,
    UncategorizedSpend,
    CashOutflow,
    OperatingSurplus,
    CashBalance,
    SavingsRate,
    SavingsAllocationRate,
    ExpenseToIncomeRate,
    EssentialShare,
    DiscretionaryShare,
    DebtShare,
    UncategorizedShare
}

public sealed record ReportingPeriod(
    JudgementReportCadence Cadence,
    string Key,
    DateOnly StartDate,
    DateOnly EndDateExclusive,
    DateTimeOffset StartInstant,
    DateTimeOffset EndInstant,
    string TimeZone);

public sealed record FinancialTransactionInput(
    Guid Id,
    decimal Amount,
    TransactionType Type,
    DateOnly TransactionDate,
    Guid? CategoryId = null,
    string? CategoryName = null,
    CategoryClassification? CategoryClassification = null,
    Guid? ParentCategoryId = null,
    string? ParentCategoryName = null);

public sealed record SummaryMetrics(
    decimal Income,
    decimal ExplicitSavings,
    decimal ConsumptionSpend,
    decimal EssentialSpend,
    decimal DiscretionarySpend,
    decimal DebtSpend,
    decimal UncategorizedSpend,
    decimal CashOutflow,
    decimal OperatingSurplus,
    decimal CashBalance,
    decimal? SavingsRate,
    decimal? SavingsAllocationRate,
    decimal? ExpenseToIncomeRate,
    decimal? EssentialShare,
    decimal? DiscretionaryShare,
    decimal? DebtShare,
    decimal? UncategorizedShare)
{
    public decimal? Get(SummaryMetricCode code) => code switch
    {
        SummaryMetricCode.Income => Income,
        SummaryMetricCode.ExplicitSavings => ExplicitSavings,
        SummaryMetricCode.ConsumptionSpend => ConsumptionSpend,
        SummaryMetricCode.EssentialSpend => EssentialSpend,
        SummaryMetricCode.DiscretionarySpend => DiscretionarySpend,
        SummaryMetricCode.DebtSpend => DebtSpend,
        SummaryMetricCode.UncategorizedSpend => UncategorizedSpend,
        SummaryMetricCode.CashOutflow => CashOutflow,
        SummaryMetricCode.OperatingSurplus => OperatingSurplus,
        SummaryMetricCode.CashBalance => CashBalance,
        SummaryMetricCode.SavingsRate => SavingsRate,
        SummaryMetricCode.SavingsAllocationRate => SavingsAllocationRate,
        SummaryMetricCode.ExpenseToIncomeRate => ExpenseToIncomeRate,
        SummaryMetricCode.EssentialShare => EssentialShare,
        SummaryMetricCode.DiscretionaryShare => DiscretionaryShare,
        SummaryMetricCode.DebtShare => DebtShare,
        SummaryMetricCode.UncategorizedShare => UncategorizedShare,
        _ => throw new ArgumentOutOfRangeException(nameof(code), code, null)
    };
}

public sealed record SpendingCategorySummary(
    string SubjectKey,
    Guid? CategoryId,
    string CategoryName,
    CategoryClassification? Classification,
    decimal Amount,
    decimal? Share,
    int TransactionCount);

public sealed record SpendingSummarySnapshot(
    ReportingPeriod Period,
    JudgementReportScope Scope,
    Guid HouseholdId,
    Guid? UserProfileId,
    string CurrencyCode,
    string CalculationVersion,
    SummaryMetrics Metrics,
    IReadOnlyList<SpendingCategorySummary> Categories,
    int TransactionCount,
    int ExpenseTransactionCount,
    int IncomeTransactionCount,
    int InvestmentTransactionCount,
    int TransferTransactionCount,
    int CategorizedTransactionCount,
    int UncategorizedTransactionCount,
    int ActiveTransactionDays,
    DateOnly? FirstTransactionDate,
    DateOnly? LastTransactionDate);

public sealed record MetricComparison(
    SummaryMetricCode Metric,
    decimal? Current,
    decimal? Previous,
    decimal? PreviousDelta,
    decimal? PreviousDeltaPercent,
    MetricTrend PreviousTrend,
    decimal? Baseline,
    decimal? BaselineDelta,
    decimal? BaselineDeltaPercent,
    MetricTrend BaselineTrend);

public sealed record CategoryComparison(
    SpendingCategorySummary Current,
    decimal? PreviousAmount,
    decimal? PreviousDeltaAmount,
    decimal? PreviousDeltaPercent,
    MetricTrend PreviousTrend,
    decimal? BaselineAmount,
    decimal? BaselineDeltaAmount,
    decimal? BaselineDeltaPercent,
    MetricTrend BaselineTrend,
    decimal? PreviousShare,
    decimal? PreviousShareDeltaPoints,
    decimal? BaselineShare,
    decimal? BaselineShareDeltaPoints,
    bool IsMaterial);

public sealed record SpendingSummaryComparison(
    SpendingSummarySnapshot Current,
    SpendingSummarySnapshot? Previous,
    int BaselinePeriodsUsed,
    int RequiredBaselinePeriods,
    JudgementDataConfidence Confidence,
    IReadOnlyDictionary<SummaryMetricCode, MetricComparison> Metrics,
    IReadOnlyList<CategoryComparison> Categories)
{
    public MetricComparison Metric(SummaryMetricCode code) => Metrics[code];
}

public sealed record DeterministicJudgement(
    string RuleCode,
    string IssueKey,
    JudgementDirection Direction,
    JudgementSeverity Severity,
    int SeverityRank,
    SpendingJudgment Tone,
    bool IsMaterial,
    SummaryMetricCode FocusMetric,
    string? SubjectKey,
    IReadOnlyDictionary<string, decimal?> Evidence,
    IReadOnlyDictionary<string, decimal> Thresholds,
    string ActionCode,
    IReadOnlyDictionary<string, string> ActionParameters);

public sealed record JudgementEvaluationResult(
    JudgementReportDirection Direction,
    JudgementDataConfidence Confidence,
    IReadOnlyList<DeterministicJudgement> Judgements);

public sealed record JudgementNarration(
    string Headline,
    string Overview,
    IReadOnlyList<string> WhatChanged,
    IReadOnlyList<string> FocusAreas,
    IReadOnlyList<string> Actions,
    bool IsDeterministicFallback = true);
