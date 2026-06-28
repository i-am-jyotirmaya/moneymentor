using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Dashboard;

public sealed record MonthlyDashboardQuery(
    Guid? HouseholdId,
    DateOnly Month,
    int RecentTransactionLimit = 6);

public sealed record MonthlyDashboardModel(
    string Month,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string MonthLabel,
    string CurrencyCode,
    decimal Income,
    decimal Spends,
    decimal Saved,
    decimal? SavingsRate,
    IReadOnlyCollection<CategorySpendSummaryModel> Categories,
    IReadOnlyCollection<DashboardJudgementModel> Judgements,
    IReadOnlyCollection<DashboardInsightModel> Insights,
    IReadOnlyCollection<TransactionModel> RecentTransactions);

public sealed record CategorySpendSummaryModel(
    string Name,
    decimal Amount,
    decimal? Budget,
    SpendingJudgment Tone,
    string Note);

public sealed record DashboardJudgementModel(
    string Title,
    SpendingJudgment Tone,
    string Value,
    string Text);

public sealed record DashboardInsightModel(
    string Title,
    string Text);

public interface IMonthlyDashboardService
{
    Task<MonthlyDashboardModel> GetMonthlyDashboardAsync(
        AppUserContext userContext,
        MonthlyDashboardQuery query,
        CancellationToken cancellationToken);
}

public interface IFinanceTransactionReader
{
    Task<IReadOnlyCollection<TransactionModel>> ListMonthlyTransactionsAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        CancellationToken cancellationToken);
}
