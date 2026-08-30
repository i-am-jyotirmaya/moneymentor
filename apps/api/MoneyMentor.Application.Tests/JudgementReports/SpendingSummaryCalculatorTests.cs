using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.JudgementReports;

public sealed class SpendingSummaryCalculatorTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public void Calculate_SeparatesConsumptionFromSavingsAllocations()
    {
        var period = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Monthly,
            new DateOnly(2026, 8, 1),
            "Asia/Kolkata");

        var result = SpendingSummaryCalculator.Calculate(
            period,
            JudgementReportScope.Personal,
            HouseholdId,
            UserId,
            "inr",
            [
                Transaction(100_000m, TransactionType.Income, new DateOnly(2026, 8, 1), CategoryClassification.Income),
                Transaction(40_000m, TransactionType.Expense, new DateOnly(2026, 8, 2), CategoryClassification.Essential),
                Transaction(10_000m, TransactionType.Expense, new DateOnly(2026, 8, 3), CategoryClassification.Discretionary),
                Transaction(5_000m, TransactionType.Expense, new DateOnly(2026, 8, 4), CategoryClassification.Debt),
                Transaction(15_000m, TransactionType.Expense, new DateOnly(2026, 8, 5), CategoryClassification.Savings),
                Transaction(10_000m, TransactionType.Investment, new DateOnly(2026, 8, 6), CategoryClassification.Savings),
                Transaction(999m, TransactionType.Transfer, new DateOnly(2026, 8, 7), null)
            ]);

        Assert.Equal("INR", result.CurrencyCode);
        Assert.Equal(100_000m, result.Metrics.Income);
        Assert.Equal(25_000m, result.Metrics.ExplicitSavings);
        Assert.Equal(55_000m, result.Metrics.ConsumptionSpend);
        Assert.Equal(80_000m, result.Metrics.CashOutflow);
        Assert.Equal(45_000m, result.Metrics.OperatingSurplus);
        Assert.Equal(20_000m, result.Metrics.CashBalance);
        Assert.Equal(45m, result.Metrics.SavingsRate);
        Assert.Equal(25m, result.Metrics.SavingsAllocationRate);
        Assert.Equal(55m, result.Metrics.ExpenseToIncomeRate);
        Assert.Equal(3, result.Categories.Sum(category => category.TransactionCount));
        Assert.DoesNotContain(result.Categories, category => category.Classification == CategoryClassification.Savings);
    }

    [Fact]
    public void Calculate_UsesNullRatesWhenDenominatorsAreZero()
    {
        var period = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Weekly,
            new DateOnly(2026, 8, 24),
            "UTC");

        var result = SpendingSummaryCalculator.Calculate(
            period,
            JudgementReportScope.Personal,
            HouseholdId,
            UserId,
            "USD",
            []);

        Assert.Null(result.Metrics.SavingsRate);
        Assert.Null(result.Metrics.SavingsAllocationRate);
        Assert.Null(result.Metrics.ExpenseToIncomeRate);
        Assert.Null(result.Metrics.DiscretionaryShare);
    }

    [Fact]
    public void PeriodCalculator_UsesIsoWeeksAndLocalMonthBoundaries()
    {
        var week = ReportingPeriodCalculator.GetPeriodContaining(
            JudgementReportCadence.Weekly,
            new DateOnly(2026, 8, 26),
            "Asia/Kolkata");
        var month = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Monthly,
            new DateOnly(2026, 8, 1),
            "Asia/Kolkata");

        Assert.Equal("2026-W35", week.Key);
        Assert.Equal(new DateOnly(2026, 8, 24), week.StartDate);
        Assert.Equal(new DateOnly(2026, 8, 31), week.EndDateExclusive);
        Assert.Equal(new DateTimeOffset(2026, 7, 31, 18, 30, 0, TimeSpan.Zero), month.StartInstant);
        Assert.Equal(new DateOnly(2026, 9, 1), month.EndDateExclusive);
    }

    [Fact]
    public void Evaluate_ClassifiesNegativeCashflowBeforeNarration()
    {
        var current = Snapshot(income: 1_000m, consumption: 1_200m, discretionary: 700m);
        var comparison = SpendingSummaryComparer.Compare(current, null, []);

        var result = DeterministicJudgementEvaluator.Evaluate(comparison);

        Assert.Equal(JudgementReportDirection.Worsened, result.Direction);
        var judgement = Assert.Single(result.Judgements, item => item.RuleCode == JudgementRuleCodes.CashflowSavings);
        Assert.Equal(JudgementDirection.Negative, judgement.Direction);
        Assert.Equal(JudgementSeverity.Alert, judgement.Severity);
        Assert.Equal(SpendingJudgment.Critical, judgement.Tone);
        Assert.Equal("RESTORE_POSITIVE_CASHFLOW", judgement.ActionCode);
    }

    [Fact]
    public void Compare_UsesMedianAndRequiresThreeMonthlyBaselines()
    {
        var current = SnapshotAt(new DateOnly(2026, 8, 1), 1_000m, 600m, 200m);
        var history = new[]
        {
            SnapshotAt(new DateOnly(2026, 7, 1), 1_000m, 300m, 100m),
            SnapshotAt(new DateOnly(2026, 6, 1), 1_000m, 500m, 100m),
            SnapshotAt(new DateOnly(2026, 5, 1), 1_000m, 400m, 100m)
        };

        var comparison = SpendingSummaryComparer.Compare(current, history[0], history);
        var consumption = comparison.Metric(SummaryMetricCode.ConsumptionSpend);

        Assert.Equal(JudgementDataConfidence.Sufficient, comparison.Confidence);
        Assert.Equal(3, comparison.BaselinePeriodsUsed);
        Assert.Equal(400m, consumption.Baseline);
        Assert.Equal(200m, consumption.BaselineDelta);
        Assert.Equal(50m, consumption.BaselineDeltaPercent);
    }

    [Fact]
    public void Compare_RecordsNewActivityWithoutAnUndefinedPercentage()
    {
        var current = SnapshotAt(new DateOnly(2026, 8, 1), 1_000m, 100m, 100m);
        var previous = SnapshotAt(new DateOnly(2026, 7, 1), 0m, 0m, 0m);

        var metric = SpendingSummaryComparer.Compare(current, previous, [previous])
            .Metric(SummaryMetricCode.ConsumptionSpend);

        Assert.Equal(MetricTrend.NewActivity, metric.PreviousTrend);
        Assert.Null(metric.PreviousDeltaPercent);
    }

    [Fact]
    public void Evaluate_HonorsRuleActivationAndConfiguredSeverityFloor()
    {
        var comparison = SpendingSummaryComparer.Compare(
            SnapshotAt(new DateOnly(2026, 8, 1), 1_000m, 850m, 100m),
            null,
            []);
        var disabled = DeterministicJudgementEvaluator.Evaluate(
            comparison,
            new JudgementEvaluationOptions(new JudgementThresholds(), new HashSet<string>()));
        var elevated = DeterministicJudgementEvaluator.Evaluate(
            comparison,
            new JudgementEvaluationOptions(
                new JudgementThresholds(),
                new HashSet<string> { JudgementRuleCodes.CashflowSavings },
                new Dictionary<string, JudgementSeverity>
                {
                    [JudgementRuleCodes.CashflowSavings] = JudgementSeverity.Alert
                }));

        Assert.Empty(disabled.Judgements);
        Assert.Equal(JudgementSeverity.Alert, Assert.Single(elevated.Judgements).Severity);
    }

    [Fact]
    public void PeriodCalculator_PreservesDstAwareCalendarBoundaries()
    {
        var march = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Monthly,
            new DateOnly(2026, 3, 1),
            "America/New_York");

        Assert.Equal(TimeSpan.FromHours(743), march.EndInstant - march.StartInstant);
        Assert.Equal(new DateOnly(2026, 4, 1), march.EndDateExclusive);
    }

    [Fact]
    public void Evaluate_LabelsANewCategoryAsNewActivityRatherThanASpike()
    {
        var categoryId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var current = SnapshotAt(new DateOnly(2026, 8, 1), 1_000m, 200m, 200m, categoryId);
        var history = new[]
        {
            SnapshotAt(new DateOnly(2026, 7, 1), 1_000m, 0m, 0m),
            SnapshotAt(new DateOnly(2026, 6, 1), 1_000m, 0m, 0m),
            SnapshotAt(new DateOnly(2026, 5, 1), 1_000m, 0m, 0m)
        };

        var result = DeterministicJudgementEvaluator.Evaluate(
            SpendingSummaryComparer.Compare(current, history[0], history));
        var finding = Assert.Single(result.Judgements, item => item.RuleCode == JudgementRuleCodes.CategoryChange);

        Assert.Equal("REVIEW_NEW_CATEGORY", finding.ActionCode);
        Assert.Equal(JudgementSeverity.Nudge, finding.Severity);
        Assert.Equal(MetricTrend.NewActivity,
            SpendingSummaryComparer.Compare(current, history[0], history).Categories.Single().BaselineTrend);
    }

    private static SpendingSummarySnapshot Snapshot(decimal income, decimal consumption, decimal discretionary)
    {
        var period = ReportingPeriodCalculator.Create(
            JudgementReportCadence.Monthly,
            new DateOnly(2026, 8, 1),
            "UTC");
        return SpendingSummaryCalculator.Calculate(
            period,
            JudgementReportScope.Personal,
            HouseholdId,
            UserId,
            "USD",
            [
                Transaction(income, TransactionType.Income, period.StartDate, CategoryClassification.Income),
                Transaction(consumption - discretionary, TransactionType.Expense, period.StartDate, CategoryClassification.Essential),
                Transaction(discretionary, TransactionType.Expense, period.StartDate, CategoryClassification.Discretionary)
            ]);
    }

    private static SpendingSummarySnapshot SnapshotAt(
        DateOnly month,
        decimal income,
        decimal consumption,
        decimal discretionary,
        Guid? discretionaryCategoryId = null)
    {
        var period = ReportingPeriodCalculator.Create(JudgementReportCadence.Monthly, month, "UTC");
        var transactions = new List<FinancialTransactionInput>();
        if (income > 0m)
        {
            transactions.Add(Transaction(income, TransactionType.Income, month, CategoryClassification.Income));
        }
        if (consumption - discretionary > 0m)
        {
            transactions.Add(Transaction(
                consumption - discretionary,
                TransactionType.Expense,
                month,
                CategoryClassification.Essential));
        }
        if (discretionary > 0m)
        {
            transactions.Add(new FinancialTransactionInput(
                Guid.NewGuid(),
                discretionary,
                TransactionType.Expense,
                month,
                discretionaryCategoryId ?? Guid.NewGuid(),
                "Discretionary",
                CategoryClassification.Discretionary));
        }
        return SpendingSummaryCalculator.Calculate(
            period,
            JudgementReportScope.Personal,
            HouseholdId,
            UserId,
            "USD",
            transactions);
    }

    private static FinancialTransactionInput Transaction(
        decimal amount,
        TransactionType type,
        DateOnly date,
        CategoryClassification? classification) =>
        new(Guid.NewGuid(), amount, type, date, Guid.NewGuid(), classification?.ToString(), classification);
}
