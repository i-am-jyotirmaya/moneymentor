using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public static class JudgementRuleCodes
{
    public const string CashflowSavings = "CASHFLOW_SAVINGS";
    public const string ConsumptionChange = "CONSUMPTION_CHANGE";
    public const string IncomeChange = "INCOME_CHANGE";
    public const string DiscretionaryShare = "DISCRETIONARY_SHARE";
    public const string CategoryChange = "CATEGORY_CHANGE";
    public const string UncategorizedData = "UNCATEGORIZED_DATA";
    public const string GoalCapacity = "GOAL_CAPACITY";
    public const string GoalPace = "GOAL_PACE";
    public const string CommitmentMissed = "COMMITMENT_MISSED";
}

public sealed record JudgementThresholds(
    decimal HealthySavingsRate = 20m,
    decimal LowSavingsRate = 10m,
    decimal SavingsRateTrendNudgePoints = 5m,
    decimal SavingsRateTrendWarningPoints = 10m,
    decimal ConsumptionNudgePercent = 10m,
    decimal ConsumptionWarningPercent = 20m,
    decimal ConsumptionRiskyPercent = 30m,
    decimal IncomeNudgePercent = 10m,
    decimal IncomeWarningPercent = 20m,
    decimal DiscretionaryWatchShare = 40m,
    decimal DiscretionaryWarningShare = 50m,
    decimal DiscretionaryTrendPoints = 5m,
    decimal DiscretionaryWarningTrendPoints = 10m,
    decimal CategorySpikePercent = 30m,
    decimal CategorySevereSpikePercent = 60m,
    decimal CategoryShareDeltaPoints = 3m,
    decimal CategoryMinimumShare = 5m,
    decimal NewCategoryShare = 10m,
    decimal UncategorizedWatchShare = 10m,
    decimal UncategorizedWarningShare = 20m);

public sealed record JudgementEvaluationOptions(
    JudgementThresholds Thresholds,
    IReadOnlySet<string>? EnabledRuleCodes = null,
    IReadOnlyDictionary<string, JudgementSeverity>? SeverityOverrides = null)
{
    public static JudgementEvaluationOptions Default { get; } = new(new JudgementThresholds());

    public bool IsEnabled(string ruleCode) => EnabledRuleCodes is null || EnabledRuleCodes.Contains(ruleCode);

    public JudgementSeverity Severity(string ruleCode, JudgementSeverity calculated)
    {
        var configured = SeverityOverrides?.GetValueOrDefault(ruleCode);
        return configured is not null && configured > calculated ? configured.Value : calculated;
    }
}

public static class DeterministicJudgementEvaluator
{
    public static JudgementEvaluationResult Evaluate(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions? options = null)
    {
        ArgumentNullException.ThrowIfNull(comparison);
        options ??= JudgementEvaluationOptions.Default;
        Validate(options.Thresholds);

        var judgements = new List<DeterministicJudgement>();
        AddCashflowSavings(comparison, options, judgements);
        AddConsumption(comparison, options, judgements);
        AddIncome(comparison, options, judgements);
        AddDiscretionary(comparison, options, judgements);
        AddCategories(comparison, options, judgements);
        AddUncategorized(comparison, options, judgements);

        var ordered = judgements
            .OrderByDescending(item => item.SeverityRank)
            .ThenByDescending(item => item.Direction == JudgementDirection.Negative)
            .ThenBy(item => item.RuleCode, StringComparer.Ordinal)
            .ToArray();
        return new JudgementEvaluationResult(
            OverallDirection(comparison.Confidence, ordered),
            comparison.Confidence,
            ordered);
    }

    private static void AddCashflowSavings(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        ICollection<DeterministicJudgement> output)
    {
        if (!options.IsEnabled(JudgementRuleCodes.CashflowSavings))
        {
            return;
        }
        var thresholds = options.Thresholds;
        var metrics = comparison.Current.Metrics;
        var rateDelta = comparison.Metric(SummaryMetricCode.SavingsRate).BaselineDelta;
        DeterministicJudgement? finding = null;

        if (metrics.OperatingSurplus < 0m)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "cashflow",
                JudgementDirection.Negative,
                JudgementSeverity.Alert,
                SpendingJudgment.Critical,
                true,
                SummaryMetricCode.OperatingSurplus,
                null,
                Evidence(("operatingSurplus", metrics.OperatingSurplus), ("savingsRate", metrics.SavingsRate)),
                Thresholds(("minimumSurplus", 0m)),
                "RESTORE_POSITIVE_CASHFLOW");
        }
        else if (metrics.SavingsRate is decimal savingsRate && savingsRate < thresholds.LowSavingsRate)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "savings-rate",
                JudgementDirection.Negative,
                JudgementSeverity.Warning,
                SpendingJudgment.NeedsAttention,
                true,
                SummaryMetricCode.SavingsRate,
                null,
                Evidence(("savingsRate", savingsRate), ("baselineDeltaPoints", rateDelta)),
                Thresholds(("minimumRate", thresholds.LowSavingsRate)),
                "INCREASE_SAVINGS_RATE");
        }
        else if (comparison.Confidence == JudgementDataConfidence.Sufficient
                 && rateDelta <= -thresholds.SavingsRateTrendWarningPoints)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "savings-rate",
                JudgementDirection.Negative,
                JudgementSeverity.Warning,
                SpendingJudgment.NeedsAttention,
                true,
                SummaryMetricCode.SavingsRate,
                null,
                Evidence(("savingsRate", metrics.SavingsRate), ("baselineDeltaPoints", rateDelta)),
                Thresholds(("declinePoints", thresholds.SavingsRateTrendWarningPoints)),
                "RECOVER_SAVINGS_RATE");
        }
        else if (metrics.SavingsRate is decimal watchRate && watchRate < thresholds.HealthySavingsRate)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "savings-rate",
                JudgementDirection.Negative,
                JudgementSeverity.Nudge,
                SpendingJudgment.Watch,
                true,
                SummaryMetricCode.SavingsRate,
                null,
                Evidence(("savingsRate", watchRate), ("baselineDeltaPoints", rateDelta)),
                Thresholds(("healthyRate", thresholds.HealthySavingsRate)),
                "BUILD_SAVINGS_BUFFER");
        }
        else if (comparison.Confidence == JudgementDataConfidence.Sufficient
                 && rateDelta <= -thresholds.SavingsRateTrendNudgePoints)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "savings-rate",
                JudgementDirection.Negative,
                JudgementSeverity.Nudge,
                SpendingJudgment.Watch,
                true,
                SummaryMetricCode.SavingsRate,
                null,
                Evidence(("savingsRate", metrics.SavingsRate), ("baselineDeltaPoints", rateDelta)),
                Thresholds(("declinePoints", thresholds.SavingsRateTrendNudgePoints)),
                "CHECK_SAVINGS_RATE");
        }
        else if (comparison.Confidence == JudgementDataConfidence.Sufficient
                 && metrics.SavingsRate >= thresholds.LowSavingsRate
                 && rateDelta >= thresholds.SavingsRateTrendNudgePoints)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "savings-rate",
                JudgementDirection.Positive,
                JudgementSeverity.Info,
                SpendingJudgment.Healthy,
                true,
                SummaryMetricCode.SavingsRate,
                null,
                Evidence(("savingsRate", metrics.SavingsRate), ("baselineDeltaPoints", rateDelta)),
                Thresholds(("improvementPoints", thresholds.SavingsRateTrendNudgePoints)),
                "KEEP_SAVINGS_MOMENTUM");
        }
        else if (metrics.SavingsRate >= thresholds.HealthySavingsRate)
        {
            finding = Finding(
                JudgementRuleCodes.CashflowSavings,
                "savings-rate",
                JudgementDirection.Neutral,
                JudgementSeverity.Info,
                SpendingJudgment.Healthy,
                false,
                SummaryMetricCode.SavingsRate,
                null,
                Evidence(("savingsRate", metrics.SavingsRate), ("baselineDeltaPoints", rateDelta)),
                Thresholds(("healthyRate", thresholds.HealthySavingsRate)),
                "MAINTAIN_SAVINGS_RATE");
        }

        if (finding is not null)
        {
            output.Add(OverrideSeverity(finding, options));
        }
    }

    private static void AddConsumption(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        ICollection<DeterministicJudgement> output)
    {
        if (!options.IsEnabled(JudgementRuleCodes.ConsumptionChange)
            || comparison.Confidence != JudgementDataConfidence.Sufficient)
        {
            return;
        }
        var thresholds = options.Thresholds;
        var change = comparison.Metric(SummaryMetricCode.ConsumptionSpend).BaselineDeltaPercent;
        if (change is null)
        {
            return;
        }

        DeterministicJudgement? finding = null;
        if (change >= thresholds.ConsumptionWarningPercent)
        {
            finding = Finding(
                JudgementRuleCodes.ConsumptionChange,
                "consumption",
                JudgementDirection.Negative,
                JudgementSeverity.Warning,
                change >= thresholds.ConsumptionRiskyPercent ? SpendingJudgment.Risky : SpendingJudgment.NeedsAttention,
                true,
                SummaryMetricCode.ConsumptionSpend,
                null,
                Evidence(("consumption", comparison.Current.Metrics.ConsumptionSpend), ("baselineChangePercent", change)),
                Thresholds(("warningPercent", thresholds.ConsumptionWarningPercent)),
                "REDUCE_CONSUMPTION");
        }
        else if (change >= thresholds.ConsumptionNudgePercent)
        {
            finding = Finding(
                JudgementRuleCodes.ConsumptionChange,
                "consumption",
                JudgementDirection.Negative,
                JudgementSeverity.Nudge,
                SpendingJudgment.Watch,
                true,
                SummaryMetricCode.ConsumptionSpend,
                null,
                Evidence(("consumption", comparison.Current.Metrics.ConsumptionSpend), ("baselineChangePercent", change)),
                Thresholds(("watchPercent", thresholds.ConsumptionNudgePercent)),
                "REVIEW_SPENDING_CHANGE");
        }
        else if (change <= -thresholds.ConsumptionNudgePercent && IsHealthyConsumptionReduction(comparison))
        {
            finding = Finding(
                JudgementRuleCodes.ConsumptionChange,
                "consumption",
                JudgementDirection.Positive,
                JudgementSeverity.Info,
                SpendingJudgment.Healthy,
                true,
                SummaryMetricCode.ConsumptionSpend,
                null,
                Evidence(("consumption", comparison.Current.Metrics.ConsumptionSpend), ("baselineChangePercent", change)),
                Thresholds(("improvementPercent", thresholds.ConsumptionNudgePercent)),
                "KEEP_SPENDING_MOMENTUM");
        }
        if (finding is not null)
        {
            output.Add(OverrideSeverity(finding, options));
        }
    }

    private static bool IsHealthyConsumptionReduction(SpendingSummaryComparison comparison)
    {
        var totalReduction = -comparison.Metric(SummaryMetricCode.ConsumptionSpend).BaselineDelta!.Value;
        var discretionaryReduction = -Math.Min(0m, comparison.Metric(SummaryMetricCode.DiscretionarySpend).BaselineDelta ?? 0m);
        var essentialChange = comparison.Metric(SummaryMetricCode.EssentialSpend).BaselineDeltaPercent;
        var incomeChange = comparison.Metric(SummaryMetricCode.Income).BaselineDeltaPercent;
        return totalReduction > 0m
            && discretionaryReduction >= totalReduction * 0.5m
            && (essentialChange is null || essentialChange > -20m)
            && (incomeChange is null || incomeChange > -10m);
    }

    private static void AddIncome(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        ICollection<DeterministicJudgement> output)
    {
        if (!options.IsEnabled(JudgementRuleCodes.IncomeChange)
            || comparison.Confidence != JudgementDataConfidence.Sufficient)
        {
            return;
        }
        var thresholds = options.Thresholds;
        var change = comparison.Metric(SummaryMetricCode.Income).BaselineDeltaPercent;
        if (change is null)
        {
            return;
        }
        DeterministicJudgement? finding = null;
        if (change <= -thresholds.IncomeWarningPercent)
        {
            finding = Finding(JudgementRuleCodes.IncomeChange, "income", JudgementDirection.Negative,
                JudgementSeverity.Warning, SpendingJudgment.NeedsAttention, true, SummaryMetricCode.Income, null,
                Evidence(("income", comparison.Current.Metrics.Income), ("baselineChangePercent", change)),
                Thresholds(("warningPercent", thresholds.IncomeWarningPercent)), "PLAN_FOR_LOWER_INCOME");
        }
        else if (change <= -thresholds.IncomeNudgePercent)
        {
            finding = Finding(JudgementRuleCodes.IncomeChange, "income", JudgementDirection.Negative,
                JudgementSeverity.Nudge, SpendingJudgment.Watch, true, SummaryMetricCode.Income, null,
                Evidence(("income", comparison.Current.Metrics.Income), ("baselineChangePercent", change)),
                Thresholds(("watchPercent", thresholds.IncomeNudgePercent)), "REVIEW_INCOME_CHANGE");
        }
        else if (change >= thresholds.IncomeNudgePercent && comparison.Current.Metrics.OperatingSurplus >= 0m)
        {
            finding = Finding(JudgementRuleCodes.IncomeChange, "income", JudgementDirection.Positive,
                JudgementSeverity.Info, SpendingJudgment.Healthy, true, SummaryMetricCode.Income, null,
                Evidence(("income", comparison.Current.Metrics.Income), ("baselineChangePercent", change)),
                Thresholds(("improvementPercent", thresholds.IncomeNudgePercent)), "USE_INCOME_GAIN_WISELY");
        }
        if (finding is not null)
        {
            output.Add(OverrideSeverity(finding, options));
        }
    }

    private static void AddDiscretionary(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        ICollection<DeterministicJudgement> output)
    {
        if (!options.IsEnabled(JudgementRuleCodes.DiscretionaryShare))
        {
            return;
        }
        var thresholds = options.Thresholds;
        var share = comparison.Current.Metrics.DiscretionaryShare;
        var change = comparison.Metric(SummaryMetricCode.DiscretionaryShare).BaselineDelta;
        if (share is null)
        {
            return;
        }
        DeterministicJudgement? finding = null;
        if (share >= thresholds.DiscretionaryWarningShare
            || comparison.Confidence == JudgementDataConfidence.Sufficient && change >= thresholds.DiscretionaryWarningTrendPoints)
        {
            finding = Finding(JudgementRuleCodes.DiscretionaryShare, "discretionary-share", JudgementDirection.Negative,
                JudgementSeverity.Warning, SpendingJudgment.NeedsAttention, true, SummaryMetricCode.DiscretionaryShare, null,
                Evidence(("share", share), ("baselineDeltaPoints", change)),
                Thresholds(("warningShare", thresholds.DiscretionaryWarningShare), ("warningDeltaPoints", thresholds.DiscretionaryWarningTrendPoints)),
                "TRIM_DISCRETIONARY_SPEND");
        }
        else if (share >= thresholds.DiscretionaryWatchShare
                 || comparison.Confidence == JudgementDataConfidence.Sufficient && change >= thresholds.DiscretionaryTrendPoints)
        {
            finding = Finding(JudgementRuleCodes.DiscretionaryShare, "discretionary-share", JudgementDirection.Negative,
                JudgementSeverity.Nudge, SpendingJudgment.Watch, true, SummaryMetricCode.DiscretionaryShare, null,
                Evidence(("share", share), ("baselineDeltaPoints", change)),
                Thresholds(("watchShare", thresholds.DiscretionaryWatchShare), ("watchDeltaPoints", thresholds.DiscretionaryTrendPoints)),
                "REVIEW_DISCRETIONARY_SPEND");
        }
        else if (comparison.Confidence == JudgementDataConfidence.Sufficient && change <= -thresholds.DiscretionaryTrendPoints)
        {
            finding = Finding(JudgementRuleCodes.DiscretionaryShare, "discretionary-share", JudgementDirection.Positive,
                JudgementSeverity.Info, SpendingJudgment.Healthy, true, SummaryMetricCode.DiscretionaryShare, null,
                Evidence(("share", share), ("baselineDeltaPoints", change)),
                Thresholds(("improvementPoints", thresholds.DiscretionaryTrendPoints)), "KEEP_DISCRETIONARY_MOMENTUM");
        }
        if (finding is not null)
        {
            output.Add(OverrideSeverity(finding, options));
        }
    }

    private static void AddCategories(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        ICollection<DeterministicJudgement> output)
    {
        if (!options.IsEnabled(JudgementRuleCodes.CategoryChange)
            || comparison.Confidence != JudgementDataConfidence.Sufficient)
        {
            return;
        }
        var thresholds = options.Thresholds;
        var candidates = new List<DeterministicJudgement>();
        foreach (var category in comparison.Categories.Where(item =>
                     item.Current.SubjectKey != "uncategorized"
                     && item.Current.Classification is not CategoryClassification.Essential
                     && item.Current.Classification is not CategoryClassification.Debt))
        {
            var percent = category.BaselineDeltaPercent;
            var shareDelta = category.BaselineShareDeltaPoints;
            DeterministicJudgement? finding = null;
            if (category.BaselineTrend == MetricTrend.NewActivity && category.Current.Share >= thresholds.NewCategoryShare)
            {
                finding = CategoryFinding(category, JudgementDirection.Negative, JudgementSeverity.Nudge,
                    SpendingJudgment.Watch, "REVIEW_NEW_CATEGORY", thresholds);
            }
            else if (category.IsMaterial
                     && percent >= thresholds.CategorySevereSpikePercent
                     && category.Current.Share >= thresholds.NewCategoryShare)
            {
                finding = CategoryFinding(category, JudgementDirection.Negative, JudgementSeverity.Warning,
                    SpendingJudgment.Risky, "REDUCE_CATEGORY_SPIKE", thresholds);
            }
            else if (category.IsMaterial
                     && percent >= thresholds.CategorySpikePercent
                     && shareDelta >= thresholds.CategoryShareDeltaPoints)
            {
                finding = CategoryFinding(category, JudgementDirection.Negative, JudgementSeverity.Warning,
                    SpendingJudgment.NeedsAttention, "REVIEW_CATEGORY_SPIKE", thresholds);
            }
            else if (category.Current.Classification == CategoryClassification.Discretionary
                     && category.IsMaterial
                     && percent <= -20m
                     && shareDelta <= -thresholds.CategoryShareDeltaPoints)
            {
                finding = CategoryFinding(category, JudgementDirection.Positive, JudgementSeverity.Info,
                    SpendingJudgment.Healthy, "KEEP_CATEGORY_MOMENTUM", thresholds);
            }
            if (finding is not null)
            {
                candidates.Add(OverrideSeverity(finding, options));
            }
        }

        foreach (var candidate in candidates
                     .OrderByDescending(item => item.SeverityRank)
                     .ThenByDescending(item => item.Direction == JudgementDirection.Negative)
                     .ThenByDescending(item => Math.Abs(item.Evidence["baselineDeltaAmount"] ?? 0m))
                     .Take(3))
        {
            output.Add(candidate);
        }
    }

    private static DeterministicJudgement CategoryFinding(
        CategoryComparison category,
        JudgementDirection direction,
        JudgementSeverity severity,
        SpendingJudgment tone,
        string actionCode,
        JudgementThresholds thresholds) => Finding(
            JudgementRuleCodes.CategoryChange,
            $"category:{category.Current.SubjectKey}",
            direction,
            severity,
            tone,
            true,
            SummaryMetricCode.ConsumptionSpend,
            category.Current.SubjectKey,
            Evidence(
                ("amount", category.Current.Amount),
                ("share", category.Current.Share),
                ("baselineDeltaAmount", category.BaselineDeltaAmount),
                ("baselineChangePercent", category.BaselineDeltaPercent),
                ("baselineShareDeltaPoints", category.BaselineShareDeltaPoints)),
            Thresholds(
                ("spikePercent", thresholds.CategorySpikePercent),
                ("severeSpikePercent", thresholds.CategorySevereSpikePercent),
                ("minimumShare", thresholds.CategoryMinimumShare),
                ("shareDeltaPoints", thresholds.CategoryShareDeltaPoints)),
            actionCode,
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["categoryName"] = category.Current.CategoryName
            });

    private static void AddUncategorized(
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        ICollection<DeterministicJudgement> output)
    {
        if (!options.IsEnabled(JudgementRuleCodes.UncategorizedData)
            || comparison.Current.Metrics.UncategorizedShare is not decimal share
            || share < options.Thresholds.UncategorizedWatchShare)
        {
            return;
        }
        var severity = share > options.Thresholds.UncategorizedWarningShare
            ? JudgementSeverity.Warning
            : JudgementSeverity.Nudge;
        var finding = Finding(
            JudgementRuleCodes.UncategorizedData,
            "uncategorized",
            JudgementDirection.Neutral,
            severity,
            SpendingJudgment.Watch,
            true,
            SummaryMetricCode.UncategorizedShare,
            "uncategorized",
            Evidence(("share", share), ("amount", comparison.Current.Metrics.UncategorizedSpend)),
            Thresholds(("watchShare", options.Thresholds.UncategorizedWatchShare), ("warningShare", options.Thresholds.UncategorizedWarningShare)),
            "CATEGORIZE_TRANSACTIONS");
        output.Add(OverrideSeverity(finding, options));
    }

    private static JudgementReportDirection OverallDirection(
        JudgementDataConfidence confidence,
        IReadOnlyCollection<DeterministicJudgement> judgements)
    {
        var negatives = judgements.Where(item => item.Direction == JudgementDirection.Negative).ToArray();
        if (negatives.Any(item => item.Severity == JudgementSeverity.Alert)
            || negatives.Count(item => item.Severity == JudgementSeverity.Warning) >= 2)
        {
            return JudgementReportDirection.Worsened;
        }
        if (judgements.Any(item => item.Direction == JudgementDirection.Positive && item.IsMaterial)
            && !negatives.Any(item => item.Severity is JudgementSeverity.Warning or JudgementSeverity.Alert))
        {
            return JudgementReportDirection.Improved;
        }
        var hasAbsoluteCondition = judgements.Any(item =>
            item.RuleCode is JudgementRuleCodes.CashflowSavings or JudgementRuleCodes.DiscretionaryShare
            && item.Direction == JudgementDirection.Negative);
        if (confidence == JudgementDataConfidence.Low && !hasAbsoluteCondition)
        {
            return JudgementReportDirection.InsufficientData;
        }
        return JudgementReportDirection.Stable;
    }

    private static DeterministicJudgement Finding(
        string ruleCode,
        string issueKey,
        JudgementDirection direction,
        JudgementSeverity severity,
        SpendingJudgment tone,
        bool isMaterial,
        SummaryMetricCode focusMetric,
        string? subjectKey,
        IReadOnlyDictionary<string, decimal?> evidence,
        IReadOnlyDictionary<string, decimal> thresholds,
        string actionCode,
        IReadOnlyDictionary<string, string>? actionParameters = null) => new(
            ruleCode,
            issueKey,
            direction,
            severity,
            SeverityRank(severity),
            tone,
            isMaterial,
            focusMetric,
            subjectKey,
            evidence,
            thresholds,
            actionCode,
            actionParameters ?? new Dictionary<string, string>());

    private static DeterministicJudgement OverrideSeverity(
        DeterministicJudgement judgement,
        JudgementEvaluationOptions options)
    {
        var severity = options.Severity(judgement.RuleCode, judgement.Severity);
        return judgement with { Severity = severity, SeverityRank = SeverityRank(severity) };
    }

    private static int SeverityRank(JudgementSeverity severity) => severity switch
    {
        JudgementSeverity.Info => 1,
        JudgementSeverity.Nudge => 2,
        JudgementSeverity.Warning => 3,
        JudgementSeverity.Alert => 4,
        _ => 0
    };

    private static IReadOnlyDictionary<string, decimal?> Evidence(params (string Key, decimal? Value)[] values) =>
        values.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);

    private static IReadOnlyDictionary<string, decimal> Thresholds(params (string Key, decimal Value)[] values) =>
        values.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);

    private static void Validate(JudgementThresholds thresholds)
    {
        var values = thresholds.GetType().GetProperties()
            .Where(property => property.PropertyType == typeof(decimal))
            .Select(property => (decimal)property.GetValue(thresholds)!);
        if (values.Any(value => value < 0m)
            || thresholds.LowSavingsRate > thresholds.HealthySavingsRate
            || thresholds.ConsumptionNudgePercent > thresholds.ConsumptionWarningPercent
            || thresholds.ConsumptionWarningPercent > thresholds.ConsumptionRiskyPercent
            || thresholds.IncomeNudgePercent > thresholds.IncomeWarningPercent
            || thresholds.DiscretionaryWatchShare > thresholds.DiscretionaryWarningShare
            || thresholds.UncategorizedWatchShare > thresholds.UncategorizedWarningShare)
        {
            throw new ArgumentException("Judgement thresholds are invalid.", nameof(thresholds));
        }
    }
}
