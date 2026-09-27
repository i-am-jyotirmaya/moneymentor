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

public sealed record JudgementNarration(
    string Headline,
    string Overview,
    IReadOnlyList<string> WhatChanged,
    IReadOnlyList<string> FocusAreas,
    IReadOnlyList<string> Actions,
    bool IsDeterministicFallback = true);
