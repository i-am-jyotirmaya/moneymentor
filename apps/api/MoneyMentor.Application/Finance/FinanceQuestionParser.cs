using System.Text.RegularExpressions;
using MoneyMentor.Application.Dashboard;

namespace MoneyMentor.Application.Finance;

public sealed partial class FinanceQuestionParser
{
    public FinanceQuestionParseResult Parse(
        string text,
        DateOnly? referenceDate)
    {
        var normalizedText = Normalize(text);
        var month = ResolveMonth(normalizedText, referenceDate);

        if (TopCategoryQuestionRegex().IsMatch(normalizedText))
        {
            return new FinanceQuestionParseResult(
                FinanceQuestionKind.TopSpendingCategory,
                month,
                null);
        }

        var categoryMatch = CategoryTotalQuestionRegex().Match(normalizedText);
        if (categoryMatch.Success)
        {
            return new FinanceQuestionParseResult(
                FinanceQuestionKind.CategorySpendTotal,
                month,
                NormalizeCategory(categoryMatch.Groups["category"].Value));
        }

        return new FinanceQuestionParseResult(
            FinanceQuestionKind.Unknown,
            month,
            null);
    }

    private static DateOnly ResolveMonth(
        string normalizedText,
        DateOnly? referenceDate)
    {
        var reference = referenceDate ?? DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
        var month = MonthlyDashboardBuilder.ToMonthStart(reference);

        return normalizedText.Contains("last month", StringComparison.Ordinal)
            ? month.AddMonths(-1)
            : month;
    }

    private static string Normalize(string value) =>
        QuestionCleanupRegex()
            .Replace(value.ToLowerInvariant(), " ")
            .Trim();

    private static string NormalizeCategory(string value)
    {
        var category = PeriodPhraseRegex()
            .Replace(value, string.Empty)
            .Trim();

        category = QuestionCleanupRegex()
            .Replace(category, " ")
            .Trim();

        return category;
    }

    [GeneratedRegex(@"\b(where|which)\b.*\b(spend|spent)\b.*\b(most|highest|largest)\b|\b(spend|spent)\b.*\b(most|highest|largest)\b", RegexOptions.CultureInvariant)]
    private static partial Regex TopCategoryQuestionRegex();

    [GeneratedRegex(@"\bhow\s+much\b.*\b(spend|spent)\b.*\bon\s+(?<category>.+)$", RegexOptions.CultureInvariant)]
    private static partial Regex CategoryTotalQuestionRegex();

    [GeneratedRegex(@"\b(this|current|last)\s+month\b|\?", RegexOptions.CultureInvariant)]
    private static partial Regex PeriodPhraseRegex();

    [GeneratedRegex(@"[^\p{L}\p{N}\s?]+|\s+", RegexOptions.CultureInvariant)]
    private static partial Regex QuestionCleanupRegex();
}

public sealed record FinanceQuestionParseResult(
    FinanceQuestionKind Kind,
    DateOnly Month,
    string? CategoryName);
