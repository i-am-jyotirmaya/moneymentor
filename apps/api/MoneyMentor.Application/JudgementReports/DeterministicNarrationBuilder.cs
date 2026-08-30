using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public static class DeterministicNarrationBuilder
{
    public static JudgementNarration Build(JudgementEvaluationResult evaluation, SpendingSummaryComparison comparison)
    {
        ArgumentNullException.ThrowIfNull(evaluation);
        ArgumentNullException.ThrowIfNull(comparison);

        var headline = evaluation.Direction switch
        {
            JudgementReportDirection.Improved => "Your financial pattern improved",
            JudgementReportDirection.Worsened => "A few financial patterns need attention",
            JudgementReportDirection.Stable => "Your financial pattern was broadly stable",
            _ => "More history is needed for a reliable comparison"
        };
        var overview = evaluation.Direction switch
        {
            JudgementReportDirection.Improved => "Based on your tracked data, the strongest changes moved in a healthier direction.",
            JudgementReportDirection.Worsened => "Based on your tracked data, one or more material changes moved in an unfavorable direction.",
            JudgementReportDirection.Stable => "Based on your tracked data, no material overall improvement or deterioration was detected.",
            _ => $"This report uses {comparison.BaselinePeriodsUsed} of {comparison.RequiredBaselinePeriods} periods needed for historical classification."
        };

        var whatChanged = evaluation.Judgements
            .Where(item => item.IsMaterial)
            .Take(5)
            .Select(item => Describe(item, comparison.Current.CurrencyCode))
            .ToArray();
        var focusAreas = evaluation.Judgements
            .Where(item => item.Direction == JudgementDirection.Negative || item.RuleCode == JudgementRuleCodes.UncategorizedData)
            .Take(3)
            .Select(item => Focus(item))
            .ToArray();
        var actions = evaluation.Judgements
            .Where(item => item.Direction != JudgementDirection.Positive)
            .Select(Action)
            .Distinct(StringComparer.Ordinal)
            .Take(3)
            .ToArray();

        return new JudgementNarration(headline, overview, whatChanged, focusAreas, actions);
    }

    private static string Describe(DeterministicJudgement judgement, string currencyCode)
    {
        var direction = judgement.Direction switch
        {
            JudgementDirection.Positive => "improved",
            JudgementDirection.Negative => "moved in an unfavorable direction",
            _ => "needs better data"
        };
        if (judgement.RuleCode == JudgementRuleCodes.CategoryChange)
        {
            var category = judgement.ActionParameters.GetValueOrDefault("categoryName") ?? "A category";
            var amount = judgement.Evidence.GetValueOrDefault("amount");
            var change = judgement.Evidence.GetValueOrDefault("baselineChangePercent");
            return $"{category} {direction}: {Money(amount, currencyCode)}, {Percent(change)} versus its historical median.";
        }
        var evidenceChange = judgement.Evidence.GetValueOrDefault("baselineChangePercent")
            ?? judgement.Evidence.GetValueOrDefault("baselineDeltaPoints");
        return $"{MetricName(judgement.FocusMetric)} {direction} ({Percent(evidenceChange)} versus its historical median).";
    }

    private static string Focus(DeterministicJudgement judgement) => judgement.ActionCode switch
    {
        "RESTORE_POSITIVE_CASHFLOW" => "Focus first on restoring positive operating cashflow.",
        "INCREASE_SAVINGS_RATE" or "RECOVER_SAVINGS_RATE" => "Focus on rebuilding the gap between income and consumption.",
        "REDUCE_CONSUMPTION" or "REVIEW_SPENDING_CHANGE" => "Review the largest discretionary increases before changing essential spending.",
        "TRIM_DISCRETIONARY_SPEND" or "REVIEW_DISCRETIONARY_SPEND" => "Review recurring and optional spending with the largest impact.",
        "PLAN_FOR_LOWER_INCOME" or "REVIEW_INCOME_CHANGE" => "Adjust near-term spending to the income currently tracked.",
        "CATEGORIZE_TRANSACTIONS" => "Categorize more transactions so future comparisons are more reliable.",
        _ when judgement.RuleCode == JudgementRuleCodes.CategoryChange =>
            $"Review {judgement.ActionParameters.GetValueOrDefault("categoryName") ?? "this category"} and set a practical limit if appropriate.",
        _ => $"Review {MetricName(judgement.FocusMetric).ToLowerInvariant()}."
    };

    private static string Action(DeterministicJudgement judgement) => judgement.ActionCode switch
    {
        "RESTORE_POSITIVE_CASHFLOW" => "Consider reducing an optional category until consumption is below income.",
        "INCREASE_SAVINGS_RATE" or "BUILD_SAVINGS_BUFFER" or "RECOVER_SAVINGS_RATE" => "Consider setting aside part of income before optional spending.",
        "REDUCE_CONSUMPTION" or "REVIEW_SPENDING_CHANGE" => "Compare the largest discretionary categories and choose one realistic reduction.",
        "TRIM_DISCRETIONARY_SPEND" or "REVIEW_DISCRETIONARY_SPEND" => "Consider a weekly limit for the largest discretionary category.",
        "PLAN_FOR_LOWER_INCOME" or "REVIEW_INCOME_CHANGE" => "Use the current tracked income when planning the next period.",
        "CATEGORIZE_TRANSACTIONS" => "Categorize the uncategorized transactions before acting on category trends.",
        _ when judgement.RuleCode == JudgementRuleCodes.CategoryChange =>
            $"Review {judgement.ActionParameters.GetValueOrDefault("categoryName") ?? "the changed category"} and decide whether the change should continue.",
        _ => "Review the exact stored metrics before making a change."
    };

    private static string MetricName(SummaryMetricCode metric) => metric switch
    {
        SummaryMetricCode.OperatingSurplus => "Operating surplus",
        SummaryMetricCode.SavingsRate => "Savings rate",
        SummaryMetricCode.ConsumptionSpend => "Consumption spending",
        SummaryMetricCode.Income => "Income",
        SummaryMetricCode.DiscretionaryShare => "Discretionary share",
        SummaryMetricCode.UncategorizedShare => "Uncategorized share",
        _ => metric.ToString()
    };

    private static string Money(decimal? value, string currencyCode) =>
        value is null ? "value unavailable" : $"{currencyCode} {value.Value:0.00}";

    private static string Percent(decimal? value) =>
        value is null ? "change unavailable" : $"{value.Value:+0.#;-0.#;0}%";
}
