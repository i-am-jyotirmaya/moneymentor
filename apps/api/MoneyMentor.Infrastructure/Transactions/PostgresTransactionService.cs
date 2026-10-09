using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Categories;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Domain.Finance;
using MoneyMentor.Infrastructure.Categories;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Infrastructure.JudgementReports;

namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class PostgresTransactionService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    DailyFinancialFactStore dailyFinancialFactStore,
    MerchantResolver merchantResolver,
    TimeProvider timeProvider,
    IFinancialEventService financialEvents,
    PostgresFinancialAccountService accounts,
    TransactionModelMapper mapper) : ITransactionService
{
    private const int MaxPageSize = 100;
    private static readonly TimeSpan TrashRetention = TimeSpan.FromDays(30);

    public async Task<TransactionModel> SaveExpenseAsync(
        SaveExpenseCommand command,
        CancellationToken cancellationToken)
    {
        return await financialEvents.SaveAsync(command.UserContext, FinancialEventInterpreter.AddMetadata(
            new TransactionIntent(FinancialEventInterpreter.DetectKind(command.Draft.SourceText) ?? TransactionKind.Purchase,
                command.Draft.Amount!.Value, command.Draft.TransactionDate)
            {
                HouseholdId = command.RequestedHouseholdId, CategoryName = command.Draft.CategoryGuess,
                Merchant = command.Draft.MerchantName, Description = command.Draft.Description,
                SourceText = command.Draft.SourceText, InputMode = command.Draft.InputMode
            }, command.Draft.SourceText), cancellationToken);
    }

    public async Task<TransactionModel> SaveIncomeAsync(SaveIncomeCommand command, CancellationToken cancellationToken)
    {
        return await financialEvents.SaveAsync(command.UserContext, FinancialEventInterpreter.AddMetadata(
            new TransactionIntent(FinancialEventInterpreter.DetectKind(command.Draft.SourceText) ?? TransactionKind.Income,
                command.Draft.Amount!.Value, command.Draft.TransactionDate)
            {
                HouseholdId = command.RequestedHouseholdId, CategoryName = GetIncomeCategoryName(command.Draft.Reason),
                Merchant = command.Draft.SenderName, Description = command.Draft.Reason,
                SourceText = command.Draft.SourceText, InputMode = command.Draft.InputMode
            }, command.Draft.SourceText), cancellationToken);
    }

    public async Task<TransactionPageModel> ListAsync(
        AppUserContext userContext,
        TransactionPageQuery query,
        CancellationToken cancellationToken)
    {
        var householdAccess = await householdAccessService.ResolveAsync(
            userContext,
            query.HouseholdId,
            requireWrite: false,
            cancellationToken);

        var page = Math.Max(query.Page, 1);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);
        var periodStart = new DateOnly(query.Month.Year, query.Month.Month, 1);
        var periodEnd = periodStart.AddMonths(1);
        var visibleTransactions = dbContext.Transactions
            .AsNoTracking()
            .Where(transaction => transaction.HouseholdId == householdAccess.HouseholdId
                && transaction.DeletedAt == null
                && transaction.TransactionDate >= periodStart
                && transaction.TransactionDate < periodEnd
                && (transaction.UserProfileId == userContext.UserProfileId
                    || transaction.Visibility == TransactionVisibility.Household));
        var totalCount = await visibleTransactions.CountAsync(cancellationToken);
        var skip = (long)(page - 1) * pageSize;
        List<Transaction> transactions;
        if (skip > int.MaxValue)
        {
            transactions = [];
        }
        else
        {
            transactions = await visibleTransactions
                .OrderByDescending(transaction => transaction.TransactionDate)
                .ThenByDescending(transaction => transaction.CreatedAt)
                .ThenByDescending(transaction => transaction.Id)
                .Skip((int)skip)
                .Take(pageSize)
                .ToListAsync(cancellationToken);
        }

        var items = await MapTransactionsAsync(
            transactions,
            householdAccess.CurrencyCode,
            userContext.UserProfileId, cancellationToken);

        return new TransactionPageModel(
            items,
            page,
            pageSize,
            totalCount,
            (int)Math.Ceiling(totalCount / (double)pageSize))
        {
            Month = $"{periodStart:yyyy-MM}"
        };
    }

    public async Task<TransactionModel?> GetAsync(
        AppUserContext userContext,
        Guid transactionId,
        CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Transactions
            .FirstOrDefaultAsync(
                item => item.Id == transactionId && item.DeletedAt == null,
                cancellationToken);

        if (transaction is null || !await CanViewAsync(transaction, userContext, cancellationToken))
        {
            return null;
        }

        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            userContext.UserProfileId, cancellationToken);
    }

    public async Task<TransactionModel?> UpdateAsync(
        AppUserContext userContext,
        Guid transactionId,
        UpdateTransactionCommand command,
        CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Transactions
            .FirstOrDefaultAsync(
                item => item.Id == transactionId && item.DeletedAt == null,
                cancellationToken);

        if (transaction is null || !await CanEditAsync(transaction, userContext, cancellationToken))
        {
            return null;
        }

        await using var mutation = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await PostgresFinancialEventService.LockAsync(dbContext, transaction.HouseholdId, cancellationToken);
        await dbContext.Entry(transaction).ReloadAsync(cancellationToken);
        if (transaction.DeletedAt != null) return null;
        var currentKind = TransactionFinancialImpactCalculator.ResolveKind(transaction.Type, transaction.Kind);
        var nextKind = command.Kind ?? currentKind;
        if (!Enum.IsDefined(nextKind) || (nextKind != currentKind && nextKind is TransactionKind.Refund or TransactionKind.Reversal)
            || (currentKind is TransactionKind.Refund or TransactionKind.Reversal && nextKind != currentKind))
            throw new FinancialTransactionValidationException("Create refunds and reversals through the financial event flow; linked event kinds cannot be changed.");
        if (command.Amount is not null && (command.Amount <= 0 || command.Amount > 999999999999m || decimal.Round(command.Amount.Value, 2) != command.Amount))
            throw new FinancialTransactionValidationException("Amount must be positive with up to two decimals.");
        if (command.TransactionDate > userContext.CurrentDate || (command.Visibility is not null && !Enum.IsDefined(command.Visibility.Value))
            || (command.PaymentChannel is not null && !Enum.IsDefined(command.PaymentChannel.Value)))
            throw new FinancialTransactionValidationException("Provide a valid date, visibility and payment channel.");
        var adjustment = await dbContext.TransactionRelations.FirstOrDefaultAsync(x => x.TransactionId == transaction.Id
            && (x.RelationType == TransactionRelationType.RefundOf || x.RelationType == TransactionRelationType.ReversalOf), cancellationToken);
        var original = adjustment is null ? null : await dbContext.Transactions.SingleAsync(x => x.Id == adjustment.RelatedTransactionId, cancellationToken);
        if (original is not null)
        {
            await PostgresFinancialEventService.ValidateAdjustmentAsync(dbContext, original, currentKind, command.Amount ?? transaction.Amount, transaction.Id, cancellationToken);
            if ((command.TransactionDate ?? transaction.TransactionDate) < original.TransactionDate)
                throw new FinancialTransactionValidationException("An adjustment cannot precede its original event.");
            if ((command.CategoryId is not null && command.CategoryId != original.CategoryId)
                || (command.CategoryName is not null && command.CategoryName != await GetCategoryNameAsync(original.CategoryId, cancellationToken))
                || (command.Visibility is not null && command.Visibility != original.Visibility))
                throw new FinancialTransactionValidationException("Linked adjustments inherit the original category and visibility.");
            adjustment!.Amount = command.Amount ?? transaction.Amount;
        }
        var changesFinancialMeaning = nextKind != currentKind || (command.Amount is not null && command.Amount != transaction.Amount)
            || (command.CategoryId is not null && command.CategoryId != transaction.CategoryId)
            || (command.CategoryName is not null && command.CategoryName != await GetCategoryNameAsync(transaction.CategoryId, cancellationToken))
            || (command.MerchantName is not null && command.MerchantName != transaction.MerchantName)
            || (command.TransactionDate is not null && command.TransactionDate != transaction.TransactionDate)
            || (command.Visibility is not null && command.Visibility != transaction.Visibility)
            || (command.AccountId is not null && command.AccountId != transaction.AccountId) || command.ClearAccount
            || (command.CounterpartyAccountId is not null && command.CounterpartyAccountId != transaction.CounterpartyAccountId) || command.ClearCounterpartyAccount;
        if (changesFinancialMeaning) await EnsureNoActiveAdjustmentsAsync(transaction.Id, cancellationToken);

        var originalTransactionDate = transaction.TransactionDate;

        var changes = new Dictionary<string, FieldChange>();
        if (nextKind != currentKind)
        {
            changes["kind"] = new FieldChange(currentKind, nextKind);
            transaction.Kind = nextKind;
            transaction.Type = TransactionFinancialImpactCalculator.TypeFor(nextKind);
            transaction.CategoryId = null;
            transaction.EnrichmentJson = null;
        }
        if (command.AccountId is not null || command.ClearAccount)
        {
            var resolved = command.ClearAccount ? null : await accounts.ResolveAsync(userContext, transaction.HouseholdId, command.AccountId, null, cancellationToken);
            changes["accountId"] = new FieldChange(transaction.AccountId, resolved?.Id);
            transaction.AccountId = resolved?.Id;
        }
        if (command.CounterpartyAccountId is not null || command.ClearCounterpartyAccount)
        {
            var resolved = command.ClearCounterpartyAccount ? null : await accounts.ResolveAsync(userContext, transaction.HouseholdId, command.CounterpartyAccountId, null, cancellationToken);
            changes["counterpartyAccountId"] = new FieldChange(transaction.CounterpartyAccountId, resolved?.Id);
            transaction.CounterpartyAccountId = resolved?.Id;
        }
        if (command.PaymentChannel is not null && command.PaymentChannel != transaction.PaymentChannel)
        {
            changes["paymentChannel"] = new FieldChange(transaction.PaymentChannel, command.PaymentChannel);
            transaction.PaymentChannel = command.PaymentChannel;
        }
        var fromAccount = transaction.AccountId is null ? null : await dbContext.FinancialAccounts.FindAsync([transaction.AccountId.Value], cancellationToken);
        var toAccount = transaction.CounterpartyAccountId is null ? null : await dbContext.FinancialAccounts.FindAsync([transaction.CounterpartyAccountId.Value], cancellationToken);
        PostgresFinancialEventService.ValidateAccounts(nextKind, await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken), fromAccount, toAccount);


        if (command.Amount is not null && transaction.Amount != command.Amount.Value)
        {
            changes["amount"] = new FieldChange(transaction.Amount, command.Amount.Value);
            transaction.Amount = command.Amount.Value;
        }

        if (command.CategoryId is not null || command.CategoryName is not null)
        {
            var categoryType = transaction.Type == TransactionType.Income
                ? CategoryType.Income
                : CategoryType.Expense;
            Guid? newCategoryId;
            string? categoryName;
            if (command.CategoryId is not null)
            {
                var selectedCategory = await dbContext.Categories.AsNoTracking()
                    .FirstOrDefaultAsync(category => category.Id == command.CategoryId.Value
                        && (category.HouseholdId == null || category.HouseholdId == transaction.HouseholdId)
                        && category.Type == categoryType && !category.IsHidden, cancellationToken)
                    ?? throw new CategoryValidationException("Choose an available category for this transaction.");
                if (selectedCategory.ParentCategoryId is not null && !await dbContext.Categories.AnyAsync(
                    category => category.Id == selectedCategory.ParentCategoryId.Value && !category.IsHidden
                        && (category.HouseholdId == null || category.HouseholdId == transaction.HouseholdId),
                    cancellationToken))
                {
                    throw new CategoryValidationException("Choose a category from an available group.");
                }
                newCategoryId = selectedCategory.Id;
                categoryName = selectedCategory.Name;
            }
            else
            {
                // Keep name-based updates compatible with existing clients.
                categoryName = NormalizeOptional(command.CategoryName);
                newCategoryId = await GetOrCreateCategoryIdAsync(categoryName, categoryType, cancellationToken);
            }
            if (transaction.CategoryId != newCategoryId)
            {
                changes["categoryName"] = new FieldChange(
                    await GetCategoryNameAsync(transaction.CategoryId, cancellationToken),
                    categoryName);
                transaction.CategoryId = newCategoryId;
            }
        }

        if (transaction.Type != TransactionType.Income && command.MerchantName is not null)
        {
            ApplyStringChange(changes, "merchantName", transaction.MerchantName, NormalizeOptional(command.MerchantName), value => transaction.MerchantName = value);
            transaction.MerchantId = await merchantResolver.ResolveAsync(transaction.HouseholdId,
                transaction.MerchantName, cancellationToken);
        }

        if (transaction.Type == TransactionType.Income && command.SenderName is not null)
        {
            ApplyStringChange(changes, "senderName", transaction.MerchantName, NormalizeOptional(command.SenderName), value => transaction.MerchantName = value);
        }

        if (transaction.Type != TransactionType.Income && command.Description is not null)
        {
            ApplyStringChange(changes, "description", transaction.Description, NormalizeOptional(command.Description), value => transaction.Description = value);
        }

        if (transaction.Type == TransactionType.Income && command.Reason is not null)
        {
            ApplyStringChange(changes, "reason", transaction.Description, NormalizeOptional(command.Reason), value => transaction.Description = value);
        }

        if (command.TransactionDate is not null)
        {
            var transactionDate = command.TransactionDate.Value;
            if (transaction.TransactionDate != transactionDate)
            {
                changes["transactionDate"] = new FieldChange(
                    transaction.TransactionDate,
                    command.TransactionDate.Value);
                transaction.TransactionDate = transactionDate;
            }
        }

        if (command.Visibility is not null && transaction.Visibility != command.Visibility.Value)
        {
            changes["visibility"] = new FieldChange(transaction.Visibility, command.Visibility.Value);
            transaction.Visibility = command.Visibility.Value;
        }

        if (changes.Count > 0)
        {
            var now = timeProvider.GetUtcNow();
            transaction.UpdatedAt = now;
            transaction.UpdatedByUserProfileId = userContext.UserProfileId;

            dbContext.TransactionAuditEntries.Add(new TransactionAuditEntry
            {
                TransactionId = transaction.Id,
                EditedByUserProfileId = userContext.UserProfileId,
                EditedAt = now,
                ChangedFieldsJson = JsonSerializer.Serialize(changes)
            });

            await SaveAndRebuildAsync(transaction.HouseholdId,
                [originalTransactionDate, transaction.TransactionDate], cancellationToken);
            RecordLifecycle("updated", transaction.Type.ToString().ToLowerInvariant());
        }

        await mutation.CommitAsync(cancellationToken);
        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            userContext.UserProfileId, cancellationToken);
    }

    public async Task<TransactionModel?> DeleteAsync(
        AppUserContext userContext,
        Guid transactionId,
        CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Transactions.FirstOrDefaultAsync(
            item => item.Id == transactionId && item.DeletedAt == null,
            cancellationToken);
        if (transaction is null || !await CanEditAsync(transaction, userContext, cancellationToken))
        {
            return null;
        }

        await using var mutation = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await PostgresFinancialEventService.LockAsync(dbContext, transaction.HouseholdId, cancellationToken);
        await dbContext.Entry(transaction).ReloadAsync(cancellationToken);
        if (transaction.DeletedAt != null) return null;
        await EnsureNoActiveAdjustmentsAsync(transaction.Id, cancellationToken);

        var now = timeProvider.GetUtcNow();
        transaction.DeletedAt = now;
        transaction.DeletedByUserProfileId = userContext.UserProfileId;
        transaction.PurgeAfter = now.Add(TrashRetention);
        transaction.UpdatedAt = now;
        transaction.UpdatedByUserProfileId = userContext.UserProfileId;
        AddAudit(transaction.Id, userContext.UserProfileId, now, "deleted", false, true);
        await SaveAndRebuildAsync(transaction.HouseholdId, [transaction.TransactionDate], cancellationToken);
        RecordLifecycle("deleted", transaction.Type.ToString().ToLowerInvariant());
        await mutation.CommitAsync(cancellationToken);
        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            userContext.UserProfileId, cancellationToken);
    }

    public async Task<TransactionModel?> RestoreAsync(
        AppUserContext userContext,
        Guid transactionId,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var transaction = await dbContext.Transactions.FirstOrDefaultAsync(
            item => item.Id == transactionId
                && item.DeletedAt != null
                && item.PurgeAfter > now,
            cancellationToken);
        if (transaction is null || !await CanEditAsync(transaction, userContext, cancellationToken))
        {
            return null;
        }

        await using var mutation = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await PostgresFinancialEventService.LockAsync(dbContext, transaction.HouseholdId, cancellationToken);
        await dbContext.Entry(transaction).ReloadAsync(cancellationToken);
        if (transaction.DeletedAt == null || transaction.PurgeAfter <= now) return null;
        var relation = await dbContext.TransactionRelations.FirstOrDefaultAsync(x => x.TransactionId == transaction.Id
            && (x.RelationType == TransactionRelationType.RefundOf || x.RelationType == TransactionRelationType.ReversalOf), cancellationToken);
        if (transaction.Kind == TransactionKind.Reversal && relation is null)
            throw new FinancialTransactionValidationException("The original transaction is no longer available.");
        if (relation is not null)
        {
            var original = await dbContext.Transactions.SingleAsync(x => x.Id == relation.RelatedTransactionId, cancellationToken);
            await PostgresFinancialEventService.ValidateAdjustmentAsync(dbContext, original, transaction.Kind!.Value, transaction.Amount, transaction.Id, cancellationToken);
        }

        transaction.DeletedAt = null;
        transaction.DeletedByUserProfileId = null;
        transaction.PurgeAfter = null;
        transaction.UpdatedAt = now;
        transaction.UpdatedByUserProfileId = userContext.UserProfileId;
        AddAudit(transaction.Id, userContext.UserProfileId, now, "deleted", true, false);
        await SaveAndRebuildAsync(transaction.HouseholdId, [transaction.TransactionDate], cancellationToken);
        RecordLifecycle("restored", transaction.Type.ToString().ToLowerInvariant());
        await mutation.CommitAsync(cancellationToken);
        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            userContext.UserProfileId, cancellationToken);
    }

    public async Task<TransactionTrashModel> ListTrashAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        var transactions = await dbContext.Transactions
            .AsNoTracking()
            .Where(transaction => transaction.HouseholdId == access.HouseholdId
                && transaction.DeletedAt != null
                && transaction.PurgeAfter > now
                && (transaction.UserProfileId == userContext.UserProfileId
                    || transaction.Visibility == TransactionVisibility.Household))
            .OrderByDescending(transaction => transaction.DeletedAt)
            .Take(100)
            .ToArrayAsync(cancellationToken);
        return new TransactionTrashModel(
            await MapTransactionsAsync(transactions, access.CurrencyCode, userContext.UserProfileId, cancellationToken));
    }

    public async Task<int> PurgeDeletedAsync(CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var purged = await dbContext.Transactions
            .Where(transaction => transaction.DeletedAt != null && transaction.PurgeAfter <= now)
            .ExecuteDeleteAsync(cancellationToken);
        if (purged > 0)
        {
            MoneyMentorTelemetry.TransactionLifecycle.Add(
                purged,
                new KeyValuePair<string, object?>("operation", "purged"));
        }

        return purged;
    }

    private async Task SaveAndRebuildAsync(Guid householdId, IEnumerable<DateOnly> dates,
        CancellationToken cancellationToken)
    {
        await dbContext.SaveChangesAsync(cancellationToken);
        foreach (var date in dates.Distinct().Order())
            await dailyFinancialFactStore.RebuildAsync(householdId, date, cancellationToken);
    }

    private async Task EnsureNoActiveAdjustmentsAsync(Guid transactionId, CancellationToken ct)
    {
        if (await (from relation in dbContext.TransactionRelations
            join adjustment in dbContext.Transactions on relation.TransactionId equals adjustment.Id
            where relation.RelatedTransactionId == transactionId && adjustment.DeletedAt == null
                && (relation.RelationType == TransactionRelationType.RefundOf || relation.RelationType == TransactionRelationType.ReversalOf)
            select relation.Id).AnyAsync(ct))
            throw new FinancialTransactionValidationException("Remove linked refunds or reversals before changing or deleting the original event.");
    }

    private static void RecordLifecycle(string operation, string type) =>
        MoneyMentorTelemetry.TransactionLifecycle.Add(
            1,
            new KeyValuePair<string, object?>("operation", operation),
            new KeyValuePair<string, object?>("type", type));

    private void AddAudit(
        Guid transactionId,
        Guid userProfileId,
        DateTimeOffset now,
        string field,
        object? before,
        object? after)
    {
        dbContext.TransactionAuditEntries.Add(new TransactionAuditEntry
        {
            TransactionId = transactionId,
            EditedByUserProfileId = userProfileId,
            EditedAt = now,
            ChangedFieldsJson = JsonSerializer.Serialize(
                new Dictionary<string, FieldChange>
                {
                    [field] = new(before, after)
                })
        });
    }

    private async Task<bool> CanViewAsync(
        Transaction transaction,
        AppUserContext userContext,
        CancellationToken cancellationToken)
    {
        if (transaction.UserProfileId == userContext.UserProfileId)
        {
            return true;
        }

        if (transaction.Visibility != TransactionVisibility.Household)
        {
            return false;
        }

        return await dbContext.HouseholdMembers.AnyAsync(
            member => member.HouseholdId == transaction.HouseholdId
                && member.UserProfileId == userContext.UserProfileId
                && member.Status == HouseholdMemberStatus.Active,
            cancellationToken);
    }

    private async Task<bool> CanEditAsync(
        Transaction transaction,
        AppUserContext userContext,
        CancellationToken cancellationToken)
    {
        try
        {
            await householdAccessService.ResolveAsync(
                userContext,
                transaction.HouseholdId,
                requireWrite: true,
                cancellationToken);
        }
        catch (HouseholdNotFoundException)
        {
            return false;
        }
        if (transaction.UserProfileId == userContext.UserProfileId)
        {
            return true;
        }

        var role = await dbContext.HouseholdMembers
            .Where(member => member.HouseholdId == transaction.HouseholdId
                && member.UserProfileId == userContext.UserProfileId
                && member.Status == HouseholdMemberStatus.Active)
            .Select(member => (HouseholdRole?)member.Role)
            .FirstOrDefaultAsync(cancellationToken);

        return role is HouseholdRole.Owner or HouseholdRole.Admin
            && transaction.Visibility == TransactionVisibility.Household;
    }

    private async Task<Guid?> GetOrCreateCategoryIdAsync(
        string? categoryName,
        CategoryType categoryType,
        CancellationToken cancellationToken) =>
        await CategoryPersistence.GetOrCreateSystemCategoryIdAsync(
            dbContext,
            categoryName,
            categoryType,
            cancellationToken);

    private async Task<TransactionModel> MapTransactionAsync(
        Transaction transaction,
        string currencyCode,
        Guid viewerId,
        CancellationToken cancellationToken)
    {
        var mapped = await MapTransactionsAsync([transaction], currencyCode, viewerId, cancellationToken);
        return mapped.Single();
    }

    private Task<IReadOnlyCollection<TransactionModel>> MapTransactionsAsync(
        IReadOnlyCollection<Transaction> transactions, string currencyCode, Guid viewerId, CancellationToken cancellationToken) =>
        mapper.MapAsync(transactions, currencyCode, viewerId, cancellationToken);

    private async Task<string?> GetCategoryNameAsync(
        Guid? categoryId,
        CancellationToken cancellationToken)
    {
        if (categoryId is null)
        {
            return null;
        }

        return await dbContext.Categories
            .Where(category => category.Id == categoryId.Value)
            .Select(category => category.Name)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static void ApplyStringChange(
        IDictionary<string, FieldChange> changes,
        string fieldName,
        string? currentValue,
        string? newValue,
        Action<string?> apply)
    {
        if (string.Equals(currentValue, newValue, StringComparison.Ordinal))
        {
            return;
        }

        changes[fieldName] = new FieldChange(currentValue, newValue);
        apply(newValue);
    }

    private Task<bool> HasCurrentAiConsentAsync(Guid userProfileId, CancellationToken cancellationToken) =>
        dbContext.PrivacyConsents.AsNoTracking().AnyAsync(consent =>
            consent.UserProfileId == userProfileId
            && consent.PolicyVersion == PrivacyPolicy.CurrentVersion, cancellationToken);

    private async Task<string> GetHouseholdCurrencyAsync(Guid householdId, CancellationToken cancellationToken) =>
        await dbContext.Households.AsNoTracking()
            .Where(household => household.Id == householdId)
            .Select(household => household.CurrencyCode)
            .SingleAsync(cancellationToken);

    private static string? NormalizeOptional(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private static string GetIncomeCategoryName(string? reason)
    {
        var normalizedReason = reason?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedReason))
        {
            return "Other Income";
        }

        if (normalizedReason.Contains("salary", StringComparison.Ordinal)
            || normalizedReason.Contains("wage", StringComparison.Ordinal))
        {
            return "Salary / Wages";
        }

        if (normalizedReason.Contains("bonus", StringComparison.Ordinal)
            || normalizedReason.Contains("incentive", StringComparison.Ordinal))
        {
            return "Bonus / Commission";
        }

        if (normalizedReason.Contains("freelance", StringComparison.Ordinal)
            || normalizedReason.Contains("client", StringComparison.Ordinal)
            || normalizedReason.Contains("consult", StringComparison.Ordinal))
        {
            return "Freelance / Self-Employment";
        }

        if (normalizedReason.Contains("refund", StringComparison.Ordinal)
            || normalizedReason.Contains("reimbursement", StringComparison.Ordinal)
            || normalizedReason.Contains("cashback", StringComparison.Ordinal))
        {
            return "Refunds / Reimbursements";
        }

        return "Other Income";
    }

    private sealed record FieldChange(object? Before, object? After);

    private sealed record CategoryProjection(
        string Name,
        Guid? ParentCategoryId,
        CategoryClassification Classification);
}
