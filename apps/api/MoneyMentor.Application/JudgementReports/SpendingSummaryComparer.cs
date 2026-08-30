using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public static class SpendingSummaryComparer
{
    public static SpendingSummaryComparison Compare(
        SpendingSummarySnapshot current,
        SpendingSummarySnapshot? previous,
        IEnumerable<SpendingSummarySnapshot> historical)
    {
        ArgumentNullException.ThrowIfNull(current);
        ArgumentNullException.ThrowIfNull(historical);

        ValidateComparable(current, previous);
        var window = historical
            .Where(item => item.Period.StartDate < current.Period.StartDate)
            .GroupBy(item => item.Period.Key, StringComparer.Ordinal)
            .Select(group => group.OrderByDescending(item => item.Period.StartDate).First())
            .OrderByDescending(item => item.Period.StartDate)
            .Take(ReportingPeriodCalculator.BaselineWindow(current.Period.Cadence))
            .ToArray();
        foreach (var item in window)
        {
            ValidateComparable(current, item);
        }

        var required = ReportingPeriodCalculator.RequiredBaselinePeriods(current.Period.Cadence);
        var confidence = window.Length >= required
            ? JudgementDataConfidence.Sufficient
            : JudgementDataConfidence.Low;

        var metrics = Enum.GetValues<SummaryMetricCode>()
            .ToDictionary(
                code => code,
                code => CompareMetric(
                    code,
                    current.Metrics.Get(code),
                    previous?.Metrics.Get(code),
                    Median(window.Select(item => item.Metrics.Get(code)))));
        var categories = CompareCategories(current, previous, window);

        return new SpendingSummaryComparison(
            current,
            previous,
            window.Length,
            required,
            confidence,
            metrics,
            categories);
    }

    public static decimal? Median(IEnumerable<decimal?> values)
    {
        ArgumentNullException.ThrowIfNull(values);
        var ordered = values.Where(value => value is not null).Select(value => value!.Value).Order().ToArray();
        if (ordered.Length == 0)
        {
            return null;
        }
        var middle = ordered.Length / 2;
        return ordered.Length % 2 == 1
            ? ordered[middle]
            : (ordered[middle - 1] + ordered[middle]) / 2m;
    }

    private static MetricComparison CompareMetric(
        SummaryMetricCode code,
        decimal? current,
        decimal? previous,
        decimal? baseline)
    {
        var previousDelta = Delta(current, previous);
        var baselineDelta = Delta(current, baseline);
        return new MetricComparison(
            code,
            current,
            previous,
            previousDelta,
            PercentDelta(current, previous),
            Trend(current, previous),
            baseline,
            baselineDelta,
            PercentDelta(current, baseline),
            Trend(current, baseline));
    }

    private static IReadOnlyList<CategoryComparison> CompareCategories(
        SpendingSummarySnapshot current,
        SpendingSummarySnapshot? previous,
        IReadOnlyList<SpendingSummarySnapshot> historical)
    {
        var currentMap = current.Categories.ToDictionary(item => item.SubjectKey, StringComparer.Ordinal);
        var previousMap = previous?.Categories.ToDictionary(item => item.SubjectKey, StringComparer.Ordinal)
            ?? new Dictionary<string, SpendingCategorySummary>(StringComparer.Ordinal);
        var keys = currentMap.Keys
            .Concat(previousMap.Keys)
            .Concat(historical.SelectMany(item => item.Categories.Select(category => category.SubjectKey)))
            .Distinct(StringComparer.Ordinal);
        var baselineConsumption = Median(historical.Select(item => (decimal?)item.Metrics.ConsumptionSpend));
        var hasPrevious = previous is not null;
        var hasBaseline = historical.Count > 0;

        return keys.Select(key =>
            {
                var template = currentMap.GetValueOrDefault(key)
                    ?? previousMap.GetValueOrDefault(key)
                    ?? historical.SelectMany(item => item.Categories).First(item => item.SubjectKey == key);
                var currentCategory = currentMap.GetValueOrDefault(key)
                    ?? template with { Amount = 0m, Share = current.Metrics.ConsumptionSpend == 0m ? null : 0m, TransactionCount = 0 };
                decimal? previousAmount = hasPrevious ? previousMap.GetValueOrDefault(key)?.Amount ?? 0m : null;
                var previousShare = hasPrevious
                    ? previousMap.GetValueOrDefault(key)?.Share ?? (previous!.Metrics.ConsumptionSpend == 0m ? null : 0m)
                    : null;
                var baselineAmount = hasBaseline
                    ? Median(historical.Select(item => (decimal?)(item.Categories.FirstOrDefault(category => category.SubjectKey == key)?.Amount ?? 0m)))
                    : null;
                var baselineShare = hasBaseline
                    ? Median(historical.Select(item =>
                        item.Categories.FirstOrDefault(category => category.SubjectKey == key)?.Share
                        ?? (item.Metrics.ConsumptionSpend == 0m ? null : 0m)))
                    : null;
                var baselineDelta = Delta(currentCategory.Amount, baselineAmount);
                var materialityFloor = Math.Max(
                    current.Metrics.ConsumptionSpend * 0.02m,
                    (baselineConsumption ?? 0m) * 0.02m);
                var isMaterial = currentCategory.Share >= 5m
                    && baselineDelta is not null
                    && Math.Abs(baselineDelta.Value) >= materialityFloor;

                return new CategoryComparison(
                    currentCategory,
                    previousAmount,
                    Delta(currentCategory.Amount, previousAmount),
                    PercentDelta(currentCategory.Amount, previousAmount),
                    Trend(currentCategory.Amount, previousAmount),
                    baselineAmount,
                    baselineDelta,
                    PercentDelta(currentCategory.Amount, baselineAmount),
                    Trend(currentCategory.Amount, baselineAmount),
                    previousShare,
                    Delta(currentCategory.Share, previousShare),
                    baselineShare,
                    Delta(currentCategory.Share, baselineShare),
                    isMaterial);
            })
            .OrderByDescending(item => item.Current.Amount)
            .ThenBy(item => item.Current.CategoryName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static decimal? Delta(decimal? current, decimal? comparator) =>
        current is null || comparator is null ? null : current.Value - comparator.Value;

    private static decimal? PercentDelta(decimal? current, decimal? comparator) =>
        current is null || comparator is null || comparator == 0m
            ? null
            : (current.Value - comparator.Value) / Math.Abs(comparator.Value) * 100m;

    private static MetricTrend Trend(decimal? current, decimal? comparator)
    {
        if (current is null || comparator is null)
        {
            return MetricTrend.NotAvailable;
        }
        if (current == comparator)
        {
            return MetricTrend.Unchanged;
        }
        if (comparator == 0m && current > 0m)
        {
            return MetricTrend.NewActivity;
        }
        if (current == 0m && comparator > 0m)
        {
            return MetricTrend.StoppedActivity;
        }
        return current > comparator ? MetricTrend.Increased : MetricTrend.Decreased;
    }

    private static void ValidateComparable(SpendingSummarySnapshot current, SpendingSummarySnapshot? comparator)
    {
        if (comparator is null)
        {
            return;
        }
        if (current.Period.Cadence != comparator.Period.Cadence
            || current.Scope != comparator.Scope
            || current.HouseholdId != comparator.HouseholdId
            || current.UserProfileId != comparator.UserProfileId
            || !string.Equals(current.CurrencyCode, comparator.CurrencyCode, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Summary snapshots must have the same cadence, scope, subject, and currency.");
        }
    }
}
