using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Infrastructure.Transactions;

namespace MoneyMentor.Infrastructure.Dashboard;

internal sealed class PostgresFinanceTransactionReader(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService, TransactionModelMapper mapper) : IFinanceTransactionReader
{
    public async Task<IReadOnlyCollection<TransactionModel>> ListMonthlyTransactionsAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        CancellationToken cancellationToken)
    {
        var householdAccess = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);

        var periodStart = new DateOnly(month.Year, month.Month, 1);
        var periodEnd = periodStart.AddMonths(1);
        var transactions = await dbContext.Transactions
            .AsNoTracking()
            .Where(transaction => transaction.HouseholdId == householdAccess.HouseholdId
                && transaction.DeletedAt == null
                && transaction.TransactionDate >= periodStart
                && transaction.TransactionDate < periodEnd
                && (transaction.UserProfileId == userContext.UserProfileId
                    || transaction.Visibility == TransactionVisibility.Household))
            .OrderByDescending(transaction => transaction.TransactionDate)
            .ThenByDescending(transaction => transaction.CreatedAt)
            .ToArrayAsync(cancellationToken);

        return await mapper.MapAsync(transactions, householdAccess.CurrencyCode, userContext.UserProfileId, cancellationToken);
    }

}
