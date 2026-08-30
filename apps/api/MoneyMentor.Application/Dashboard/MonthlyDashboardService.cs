using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Judgements;

namespace MoneyMentor.Application.Dashboard;

public sealed class MonthlyDashboardService(
    IFinanceTransactionReader transactionReader,
    MonthlyDashboardBuilder dashboardBuilder,
    IJudgementService? judgementService = null) : IMonthlyDashboardService
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
        IReadOnlyCollection<JudgementModel> judgements = judgementService is null
            ? []
            : await judgementService.ListAsync(
                userContext,
                query.HouseholdId,
                month,
                cancellationToken);

        return dashboardBuilder.Build(
            userContext,
            month,
            transactions,
            query.RecentTransactionLimit,
            judgements.Select(judgement => judgement.ToDashboardModel()).ToArray());
    }
}
