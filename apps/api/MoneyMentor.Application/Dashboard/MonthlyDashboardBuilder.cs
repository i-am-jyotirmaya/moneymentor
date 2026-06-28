using System.Globalization;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Dashboard;

public sealed class MonthlyDashboardBuilder
{
    private const string UncategorizedCategoryName = "Uncategorized";

    public MonthlyDashboardModel Build(
        AppUserContext userContext,
        DateOnly month,
        IReadOnlyCollection<TransactionModel> transactions,
        int recentTransactionLimit)
    {
        var periodStart = ToMonthStart(month);
        var periodEnd = periodStart.AddMonths(1).AddDays(-1);
        var expenses = transactions
            .Where(transaction => transaction.Type == TransactionType.Expense)
            .ToArray();
        var income = transactions
            .Where(transaction => transaction.Type == TransactionType.Income)
            .Sum(transaction => transaction.Amount);
        var spends = expenses.Sum(transaction => transaction.Amount);
        var saved = income - spends;
        decimal? savingsRate = income > 0m
            ? decimal.Round(saved / income * 100m, 1)
            : null;
        var categories = BuildCategorySummaries(expenses, spends);

        return new MonthlyDashboardModel(
            $"{periodStart.Year:D4}-{periodStart.Month:D2}",
            periodStart,
            periodEnd,
            periodStart.ToString("MMMM yyyy", CultureInfo.InvariantCulture),
            userContext.CurrencyCode,
            income,
            spends,
            saved,
            savingsRate,
            categories,
            BuildJudgements(categories, income, spends, savingsRate),
            BuildInsights(categories, income, spends),
            transactions
                .OrderByDescending(transaction => transaction.TransactionDate)
                .ThenByDescending(transaction => transaction.CreatedAt)
                .Take(Math.Clamp(recentTransactionLimit, 1, 12))
                .ToArray());
    }

    public static DateOnly ToMonthStart(DateOnly value) =>
        new(value.Year, value.Month, 1);

    private static IReadOnlyCollection<CategorySpendSummaryModel> BuildCategorySummaries(
        IReadOnlyCollection<TransactionModel> expenses,
        decimal spends)
    {
        if (expenses.Count == 0)
        {
            return [];
        }

        return expenses
            .GroupBy(transaction => NormalizeCategoryName(transaction.CategoryName))
            .Select(group =>
            {
                var amount = group.Sum(transaction => transaction.Amount);
                var tone = GetCategoryTone(amount, spends);

                return new CategorySpendSummaryModel(
                    group.Key,
                    amount,
                    null,
                    tone,
                    BuildCategoryNote(group.Key, tone));
            })
            .OrderByDescending(category => category.Amount)
            .ThenBy(category => category.Name)
            .ToArray();
    }

    private static IReadOnlyCollection<DashboardJudgementModel> BuildJudgements(
        IReadOnlyCollection<CategorySpendSummaryModel> categories,
        decimal income,
        decimal spends,
        decimal? savingsRate)
    {
        if (income == 0m && spends == 0m)
        {
            return
            [
                new DashboardJudgementModel(
                    "No tracked data",
                    SpendingJudgment.Watch,
                    "0",
                    "Track a few expenses this month and MoneyMentor will start showing useful patterns.")
            ];
        }

        var judgements = new List<DashboardJudgementModel>();

        if (savingsRate is not null)
        {
            var savingsTone = savingsRate.Value switch
            {
                >= 30m => SpendingJudgment.Healthy,
                >= 10m => SpendingJudgment.Watch,
                _ => SpendingJudgment.NeedsAttention
            };

            judgements.Add(new DashboardJudgementModel(
                savingsTone == SpendingJudgment.Healthy ? "Healthy" : "Savings watch",
                savingsTone,
                $"{savingsRate:0.#}%",
                savingsTone == SpendingJudgment.Healthy
                    ? "Your savings rate is strong based on tracked income and spending."
                    : "Your savings rate is worth watching based on tracked income and spending."));
        }

        var topCategory = categories.FirstOrDefault();
        if (topCategory is not null)
        {
            judgements.Add(new DashboardJudgementModel(
                topCategory.Tone == SpendingJudgment.NeedsAttention ? "Needs attention" : "Top category",
                topCategory.Tone,
                topCategory.Name,
                $"{topCategory.Name} is currently your largest tracked expense category this month."));
        }

        if (spends > 0m && income == 0m)
        {
            judgements.Add(new DashboardJudgementModel(
                "Income missing",
                SpendingJudgment.Watch,
                "No income",
                "Spending is tracked, but income is not available for this month yet."));
        }

        return judgements;
    }

    private static IReadOnlyCollection<DashboardInsightModel> BuildInsights(
        IReadOnlyCollection<CategorySpendSummaryModel> categories,
        decimal income,
        decimal spends)
    {
        if (spends == 0m && income == 0m)
        {
            return
            [
                new DashboardInsightModel(
                    "Best next move",
                    "Track one or two natural-language expenses to build your first real snapshot."),
                new DashboardInsightModel(
                    "Pattern noticed",
                    "MoneyMentor needs stored transactions before it can make spending observations.")
            ];
        }

        var topCategory = categories.FirstOrDefault();
        if (topCategory is null)
        {
            return
            [
                new DashboardInsightModel(
                    "Best next move",
                    "Income is visible, but no expenses are tracked for this month yet.")
            ];
        }

        return
        [
            new DashboardInsightModel(
                "Best next move",
                $"Review {topCategory.Name} first if you want to reduce this month's spending."),
            new DashboardInsightModel(
                "Pattern noticed",
                $"{topCategory.Name} accounts for the largest share of tracked expenses this month.")
        ];
    }

    private static SpendingJudgment GetCategoryTone(decimal amount, decimal spends)
    {
        if (spends <= 0m)
        {
            return SpendingJudgment.Healthy;
        }

        var share = amount / spends;
        return share switch
        {
            >= 0.40m => SpendingJudgment.NeedsAttention,
            >= 0.25m => SpendingJudgment.Watch,
            _ => SpendingJudgment.Healthy
        };
    }

    private static string BuildCategoryNote(string categoryName, SpendingJudgment tone) =>
        tone switch
        {
            SpendingJudgment.NeedsAttention =>
                $"{categoryName} is taking a large share of tracked spending this month.",
            SpendingJudgment.Watch =>
                $"{categoryName} is worth watching as the month develops.",
            _ =>
                $"{categoryName} looks steady based on tracked spending."
        };

    private static string NormalizeCategoryName(string? categoryName) =>
        string.IsNullOrWhiteSpace(categoryName)
            ? UncategorizedCategoryName
            : categoryName.Trim();
}
