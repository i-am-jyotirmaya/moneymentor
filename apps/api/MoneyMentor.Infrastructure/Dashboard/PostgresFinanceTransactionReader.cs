using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Dashboard;

internal sealed class PostgresFinanceTransactionReader(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService) : IFinanceTransactionReader
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

        return await MapTransactionsAsync(
            transactions,
            userContext.CurrencyCode,
            cancellationToken);
    }

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
            .ToDictionaryAsync(
                category => category.Id,
                category => new CategoryProjection(
                    category.Name,
                    category.ParentCategoryId,
                    category.Classification),
                cancellationToken);
        var parentIds = categories.Values
            .Select(category => category.ParentCategoryId)
            .OfType<Guid>()
            .Distinct()
            .ToArray();
        var parentNames = await dbContext.Categories
            .AsNoTracking()
            .Where(category => parentIds.Contains(category.Id))
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var userProfiles = await dbContext.UserProfiles
            .AsNoTracking()
            .Where(userProfile => userProfileIds.Contains(userProfile.Id))
            .ToDictionaryAsync(userProfile => userProfile.Id, userProfile => userProfile.DisplayName, cancellationToken);

        return transactions
            .Select(transaction =>
            {
                CategoryProjection? category = null;
                if (transaction.CategoryId is not null)
                {
                    categories.TryGetValue(transaction.CategoryId.Value, out category);
                }

                return new TransactionModel(
                    transaction.Id,
                    transaction.HouseholdId,
                    transaction.UserProfileId,
                    transaction.Amount,
                    currencyCode,
                    transaction.Type,
                    category?.Name,
                    transaction.MerchantName,
                    transaction.Description,
                    transaction.SourceText,
                    transaction.TransactionDate,
                    transaction.InputMode,
                    transaction.Confidence,
                    transaction.Visibility,
                    transaction.CreatedAt,
                    transaction.UpdatedAt,
                    transaction.UpdatedByUserProfileId is null
                        ? null
                        : userProfiles.GetValueOrDefault(transaction.UpdatedByUserProfileId.Value))
                {
                    ParentCategoryName = category?.ParentCategoryId is null
                        ? null
                        : parentNames.GetValueOrDefault(category.ParentCategoryId.Value),
                    CategoryClassification = category?.Classification
                };
            })
            .ToArray();
    }

    private sealed record CategoryProjection(
        string Name,
        Guid? ParentCategoryId,
        CategoryClassification Classification);

}
