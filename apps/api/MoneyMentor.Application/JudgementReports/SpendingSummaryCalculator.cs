using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public static class SpendingSummaryCalculator
{
    public const string CalculationVersion = "v1";

    public static SpendingSummarySnapshot Calculate(
        ReportingPeriod period,
        JudgementReportScope scope,
        Guid householdId,
        Guid? userProfileId,
        string currencyCode,
        IEnumerable<FinancialTransactionInput> transactions)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(currencyCode);
        ArgumentNullException.ThrowIfNull(transactions);
        if (scope == JudgementReportScope.Personal && userProfileId is null)
        {
            throw new ArgumentException("A personal summary requires a user profile.", nameof(userProfileId));
        }

        var items = transactions
            .Where(item => item.TransactionDate >= period.StartDate && item.TransactionDate < period.EndDateExclusive)
            .ToList();
        if (items.Any(item => item.Amount < 0m))
        {
            throw new ArgumentOutOfRangeException(nameof(transactions), "Transaction amounts cannot be negative.");
        }

        var income = Sum(items, item => item.Type == TransactionType.Income);
        var explicitSavings = Sum(items, item =>
            item.Type == TransactionType.Investment
            || item.Type == TransactionType.Expense && item.CategoryClassification == CategoryClassification.Savings);
        var consumptionItems = items.Where(item =>
            item.Type == TransactionType.Expense
            && item.CategoryClassification != CategoryClassification.Savings).ToList();
        var consumption = consumptionItems.Sum(item => item.Amount);
        var essential = consumptionItems.Where(item => item.CategoryClassification == CategoryClassification.Essential).Sum(item => item.Amount);
        var discretionary = consumptionItems.Where(item => item.CategoryClassification == CategoryClassification.Discretionary).Sum(item => item.Amount);
        var debt = consumptionItems.Where(item => item.CategoryClassification == CategoryClassification.Debt).Sum(item => item.Amount);
        var uncategorized = consumptionItems.Where(IsUncategorized).Sum(item => item.Amount);
        var cashOutflow = consumption + explicitSavings;
        var operatingSurplus = income - consumption;
        var cashBalance = income - cashOutflow;

        var metrics = new SummaryMetrics(
            income,
            explicitSavings,
            consumption,
            essential,
            discretionary,
            debt,
            uncategorized,
            cashOutflow,
            operatingSurplus,
            cashBalance,
            Rate(operatingSurplus, income),
            Rate(explicitSavings, income),
            Rate(consumption, income),
            Rate(essential, consumption),
            Rate(discretionary, consumption),
            Rate(debt, consumption),
            Rate(uncategorized, consumption));

        var categories = consumptionItems
            .GroupBy(ToCategoryIdentity)
            .Select(group =>
            {
                var amount = group.Sum(item => item.Amount);
                return new SpendingCategorySummary(
                    group.Key.SubjectKey,
                    group.Key.CategoryId,
                    group.Key.Name,
                    group.Key.Classification,
                    amount,
                    Rate(amount, consumption),
                    group.Count());
            })
            .OrderByDescending(category => category.Amount)
            .ThenBy(category => category.CategoryName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var categorizedCount = items.Count(item => item.CategoryId is not null && item.CategoryClassification is not null);
        var datedItems = items.OrderBy(item => item.TransactionDate).ToArray();
        return new SpendingSummarySnapshot(
            period,
            scope,
            householdId,
            userProfileId,
            currencyCode.Trim().ToUpperInvariant(),
            CalculationVersion,
            metrics,
            categories,
            items.Count,
            items.Count(item => item.Type == TransactionType.Expense),
            items.Count(item => item.Type == TransactionType.Income),
            items.Count(item => item.Type == TransactionType.Investment),
            items.Count(item => item.Type == TransactionType.Transfer),
            categorizedCount,
            items.Count - categorizedCount,
            items.Select(item => item.TransactionDate).Distinct().Count(),
            datedItems.FirstOrDefault()?.TransactionDate,
            datedItems.LastOrDefault()?.TransactionDate);
    }

    private static decimal Sum(IEnumerable<FinancialTransactionInput> items, Func<FinancialTransactionInput, bool> predicate) =>
        items.Where(predicate).Sum(item => item.Amount);

    private static decimal? Rate(decimal numerator, decimal denominator) =>
        denominator == 0m ? null : numerator / denominator * 100m;

    private static bool IsUncategorized(FinancialTransactionInput item) =>
        item.CategoryId is null || item.CategoryClassification is null;

    private static CategoryIdentity ToCategoryIdentity(FinancialTransactionInput item)
    {
        if (IsUncategorized(item))
        {
            return new CategoryIdentity("uncategorized", null, "Uncategorized", null);
        }

        var categoryId = item.ParentCategoryId ?? item.CategoryId;
        return new CategoryIdentity(
            categoryId!.Value.ToString("N"),
            categoryId,
            item.ParentCategoryName ?? item.CategoryName ?? "Uncategorized",
            item.CategoryClassification);
    }

    private sealed record CategoryIdentity(
        string SubjectKey,
        Guid? CategoryId,
        string Name,
        CategoryClassification? Classification);
}
