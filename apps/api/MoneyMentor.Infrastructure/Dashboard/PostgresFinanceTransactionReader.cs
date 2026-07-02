using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Dashboard;

internal sealed class PostgresFinanceTransactionReader(
    MoneyMentorDbContext dbContext) : IFinanceTransactionReader
{
    public async Task<IReadOnlyCollection<TransactionModel>> ListMonthlyTransactionsAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        CancellationToken cancellationToken)
    {
        var householdIds = await GetActiveHouseholdIdsAsync(
            userContext.UserProfileId,
            cancellationToken);
        if (householdId is not null)
        {
            householdIds = householdIds.Contains(householdId.Value)
                ? [householdId.Value]
                : [];
        }

        var periodStart = ToUtcDate(new DateOnly(month.Year, month.Month, 1));
        var periodEnd = periodStart.AddMonths(1);
        var transactions = await dbContext.Transactions
            .AsNoTracking()
            .Where(transaction => householdIds.Contains(transaction.HouseholdId)
                && transaction.TransactionDate >= periodStart
                && transaction.TransactionDate < periodEnd
                && (transaction.UserProfileId == userContext.UserProfileId
                    || transaction.Visibility == TransactionVisibility.Household))
            .OrderByDescending(transaction => transaction.TransactionDate)
            .ThenByDescending(transaction => transaction.CreatedAt)
            .ToArrayAsync(cancellationToken);

        return await MapTransactionsAsync(
            transactions,
            userContext.CurrencyCode,
            cancellationToken);
    }

    private async Task<IReadOnlyCollection<Guid>> GetActiveHouseholdIdsAsync(
        Guid userProfileId,
        CancellationToken cancellationToken) =>
        await dbContext.HouseholdMembers
            .AsNoTracking()
            .Where(member => member.UserProfileId == userProfileId
                && member.Status == HouseholdMemberStatus.Active)
            .Select(member => member.HouseholdId)
            .ToArrayAsync(cancellationToken);

    private async Task<IReadOnlyCollection<TransactionModel>> MapTransactionsAsync(
        IReadOnlyCollection<Transaction> transactions,
        string currencyCode,
        CancellationToken cancellationToken)
    {
        var categoryIds = transactions
            .Select(transaction => transaction.CategoryId)
            .OfType<Guid>()
            .Distinct()
            .ToArray();
        var userProfileIds = transactions
            .Select(transaction => transaction.UpdatedByUserProfileId)
            .OfType<Guid>()
            .Distinct()
            .ToArray();

        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(category => categoryIds.Contains(category.Id))
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var userProfiles = await dbContext.UserProfiles
            .AsNoTracking()
            .Where(userProfile => userProfileIds.Contains(userProfile.Id))
            .ToDictionaryAsync(userProfile => userProfile.Id, userProfile => userProfile.DisplayName, cancellationToken);

        return transactions
            .Select(transaction => new TransactionModel(
                transaction.Id,
                transaction.HouseholdId,
                transaction.UserProfileId,
                transaction.Amount,
                currencyCode,
                transaction.Type,
                transaction.CategoryId is null
                    ? null
                    : categories.GetValueOrDefault(transaction.CategoryId.Value),
                transaction.MerchantName,
                transaction.Description,
                transaction.SourceText,
                ToDateOnly(transaction.TransactionDate),
                transaction.InputMode,
                transaction.Confidence,
                transaction.Visibility,
                transaction.CreatedAt,
                transaction.UpdatedAt,
                transaction.UpdatedByUserProfileId is null
                    ? null
                    : userProfiles.GetValueOrDefault(transaction.UpdatedByUserProfileId.Value)))
            .ToArray();
    }

    private static DateTimeOffset ToUtcDate(DateOnly date) =>
        new(
            DateTime.SpecifyKind(
                date.ToDateTime(TimeOnly.MinValue),
                DateTimeKind.Utc));

    private static DateOnly ToDateOnly(DateTimeOffset dateTimeOffset) =>
        DateOnly.FromDateTime(dateTimeOffset.UtcDateTime);
}
