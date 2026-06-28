using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Application.Dashboard;

public sealed class MonthlyDashboardService(
    IFinanceTransactionReader transactionReader,
    MonthlyDashboardBuilder dashboardBuilder) : IMonthlyDashboardService
{
    public async Task<MonthlyDashboardModel> GetMonthlyDashboardAsync(
        AppUserContext userContext,
        MonthlyDashboardQuery query,
        CancellationToken cancellationToken)
    {
        var month = MonthlyDashboardBuilder.ToMonthStart(query.Month);
        var transactions = await transactionReader.ListMonthlyTransactionsAsync(
            userContext,
            query.HouseholdId,
            month,
            cancellationToken);

        return dashboardBuilder.Build(
            userContext,
            month,
            transactions,
            query.RecentTransactionLimit);
    }
}
