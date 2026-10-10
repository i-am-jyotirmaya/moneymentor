using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Domain.Finance;
using MoneyMentor.Infrastructure.Persistence;
namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class TransactionModelMapper(MoneyMentorDbContext db)
{
    public async Task<IReadOnlyCollection<TransactionModel>> MapAsync(IReadOnlyCollection<Transaction> rows,
        string currency, Guid viewerId, CancellationToken ct)
    {
        var categoryIds = rows.Select(x => x.CategoryId).OfType<Guid>().Distinct().ToArray();
        var categories = await db.Categories.AsNoTracking().Where(x => categoryIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var parentIds = categories.Values.Select(x => x.ParentCategoryId).OfType<Guid>().Distinct().ToArray();
        var parents = await db.Categories.AsNoTracking().Where(x => parentIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var userIds = rows.Select(x => x.UpdatedByUserProfileId).OfType<Guid>().Distinct().ToArray();
        var users = await db.UserProfiles.AsNoTracking().Where(x => userIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
        var accountIds = rows.SelectMany(x => new[] { x.AccountId, x.CounterpartyAccountId }).OfType<Guid>().Distinct().ToArray();
        var accounts = await db.FinancialAccounts.AsNoTracking().Where(x => accountIds.Contains(x.Id)
            && (x.OwnerUserProfileId == null || x.OwnerUserProfileId == viewerId)).ToDictionaryAsync(x => x.Id, ct);
        var ids = rows.Select(x => x.Id).ToArray();
        var relations = await (from relation in db.TransactionRelations.AsNoTracking()
            join original in db.Transactions.AsNoTracking() on relation.RelatedTransactionId equals original.Id
            where ids.Contains(relation.TransactionId)
                && (relation.RelationType == TransactionRelationType.RefundOf || relation.RelationType == TransactionRelationType.ReversalOf)
                && (original.UserProfileId == viewerId || original.Visibility == TransactionVisibility.Household)
            select relation).ToArrayAsync(ct);
        return rows.Select(x =>
        {
            var category = x.CategoryId is null ? null : categories.GetValueOrDefault(x.CategoryId.Value);
            var account = x.AccountId is null ? null : accounts.GetValueOrDefault(x.AccountId.Value);
            var counterparty = x.CounterpartyAccountId is null ? null : accounts.GetValueOrDefault(x.CounterpartyAccountId.Value);
            return new TransactionModel(x.Id, x.HouseholdId, x.UserProfileId, x.Amount, currency, x.Type,
                category?.Name, x.Type == TransactionType.Income ? null : x.MerchantName,
                x.Type == TransactionType.Income ? null : x.Description, x.SourceText, x.TransactionDate, x.InputMode,
                x.Confidence, x.Visibility, x.CreatedAt, x.UpdatedAt,
                x.UpdatedByUserProfileId is null ? null : users.GetValueOrDefault(x.UpdatedByUserProfileId.Value))
            {
                Kind = TransactionFinancialImpactCalculator.ResolveKind(x.Type, x.Kind), ReversedKind = x.ReversedKind,
                AccountId = account?.Id, AccountName = account?.Name,
                CounterpartyAccountId = counterparty?.Id, CounterpartyAccountName = counterparty?.Name,
                PaymentChannel = x.PaymentChannel, CategoryId = x.CategoryId,
                RelatedTransactionId = relations.FirstOrDefault(a => a.TransactionId == x.Id)?.RelatedTransactionId,
                SenderName = x.Type == TransactionType.Income ? x.MerchantName : null,
                Reason = x.Type == TransactionType.Income ? x.Description : null,
                DeletedAt = x.DeletedAt, PurgeAfter = x.PurgeAfter,
                ParentCategoryName = category?.ParentCategoryId is null ? null : parents.GetValueOrDefault(category.ParentCategoryId.Value),
                CategoryClassification = category?.Classification
            };
        }).ToArray();
    }
}
