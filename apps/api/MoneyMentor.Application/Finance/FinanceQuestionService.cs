using System.Globalization;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;

namespace MoneyMentor.Application.Finance;

public sealed class FinanceQuestionService(
    IMonthlyDashboardService dashboardService,
    FinanceQuestionParser questionParser) : IFinanceQuestionService
{
    public async Task<FinanceQuestionAnswerModel> AnswerAsync(
        AppUserContext userContext,
        FinanceQuestionRequest request,
        CancellationToken cancellationToken)
    {
        var parsedQuestion = questionParser.Parse(
            request.Text,
            request.ReferenceDate);
        var dashboard = await dashboardService.GetMonthlyDashboardAsync(
            userContext,
            new MonthlyDashboardQuery(
                request.HouseholdId,
                parsedQuestion.Month,
                RecentTransactionLimit: 6),
            cancellationToken);

        return parsedQuestion.Kind switch
        {
            FinanceQuestionKind.TopSpendingCategory => BuildTopCategoryAnswer(
                request,
                dashboard),
            FinanceQuestionKind.CategorySpendTotal => BuildCategoryTotalAnswer(
                request,
                parsedQuestion,
                dashboard),
            _ => BuildUnknownAnswer(request, dashboard)
        };
    }

    private static FinanceQuestionAnswerModel BuildTopCategoryAnswer(
        FinanceQuestionRequest request,
        MonthlyDashboardModel dashboard)
    {
        var topCategory = dashboard.Categories.FirstOrDefault();
        if (topCategory is null)
        {
            return CreateAnswer(
                FinanceQuestionKind.TopSpendingCategory,
                request,
                dashboard,
                "I do not see any tracked expenses for this month yet.",
                null,
                null);
        }

        return CreateAnswer(
            FinanceQuestionKind.TopSpendingCategory,
            request,
            dashboard,
            $"You spent the most on {topCategory.Name}: {FormatAmount(topCategory.Amount, dashboard.CurrencyCode)} in {dashboard.MonthLabel}.",
            topCategory.Amount,
            topCategory.Name);
    }

    private static FinanceQuestionAnswerModel BuildCategoryTotalAnswer(
        FinanceQuestionRequest request,
        FinanceQuestionParseResult parsedQuestion,
        MonthlyDashboardModel dashboard)
    {
        var requestedCategory = parsedQuestion.CategoryName;
        if (string.IsNullOrWhiteSpace(requestedCategory))
        {
            return BuildUnknownAnswer(request, dashboard);
        }

        var category = dashboard.Categories.FirstOrDefault(item =>
            string.Equals(
                item.Name,
                requestedCategory,
                StringComparison.OrdinalIgnoreCase));

        if (category is null)
        {
            return CreateAnswer(
                FinanceQuestionKind.CategorySpendTotal,
                request,
                dashboard,
                $"I do not see tracked {requestedCategory} spending for {dashboard.MonthLabel}.",
                0m,
                requestedCategory);
        }

        return CreateAnswer(
            FinanceQuestionKind.CategorySpendTotal,
            request,
            dashboard,
            $"You spent {FormatAmount(category.Amount, dashboard.CurrencyCode)} on {category.Name} in {dashboard.MonthLabel}.",
            category.Amount,
            category.Name);
    }

    private static FinanceQuestionAnswerModel BuildUnknownAnswer(
        FinanceQuestionRequest request,
        MonthlyDashboardModel dashboard) =>
        CreateAnswer(
            FinanceQuestionKind.Unknown,
            request,
            dashboard,
            "I can answer questions like where you spent most this month or how much you spent on a category.",
            null,
            null);

    private static FinanceQuestionAnswerModel CreateAnswer(
        FinanceQuestionKind kind,
        FinanceQuestionRequest request,
        MonthlyDashboardModel dashboard,
        string answer,
        decimal? amount,
        string? categoryName) =>
        new(
            kind,
            request.Text,
            answer,
            dashboard.Month,
            dashboard.PeriodStart,
            dashboard.PeriodEnd,
            dashboard.CurrencyCode,
            amount,
            categoryName,
            dashboard.Categories);

    private static string FormatAmount(decimal amount, string currencyCode)
    {
        var formattedAmount = amount.ToString("0.##", CultureInfo.InvariantCulture);
        return string.Equals(currencyCode, "INR", StringComparison.OrdinalIgnoreCase)
            ? $"₹{formattedAmount}"
            : $"{currencyCode.ToUpperInvariant()} {formattedAmount}";
    }
}
