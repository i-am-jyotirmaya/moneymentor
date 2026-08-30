using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Categories;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Infrastructure.JudgementReports;

namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class PostgresTransactionService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    IJudgementReportRecalculationQueue judgementReportRecalculationQueue,
    TimeProvider timeProvider) : ITransactionService
{
    private const int MaxPageSize = 100;
    private static readonly TimeSpan TrashRetention = TimeSpan.FromDays(30);

    public async Task<TransactionModel> SaveExpenseAsync(
        SaveExpenseCommand command,
        CancellationToken cancellationToken)
    {
        var householdAccess = await householdAccessService.ResolveAsync(
            command.UserContext,
            command.RequestedHouseholdId,
            requireWrite: true,
            cancellationToken);
        var categoryId = await GetOrCreateCategoryIdAsync(
            command.Draft.CategoryGuess,
            CategoryType.Expense,
            cancellationToken);
        var now = timeProvider.GetUtcNow();

        var transaction = new Transaction
        {
            HouseholdId = householdAccess.HouseholdId,
            UserProfileId = command.UserContext.UserProfileId,
            Amount = command.Draft.Amount!.Value,
            Type = TransactionType.Expense,
            CategoryId = categoryId,
            MerchantName = NormalizeOptional(command.Draft.MerchantName),
            Description = NormalizeOptional(command.Draft.Description),
            SourceText = command.Draft.SourceText,
            TransactionDate = command.Draft.TransactionDate ?? command.UserContext.CurrentDate,
            InputMode = command.Draft.InputMode,
            Confidence = command.Draft.Confidence,
            Visibility = command.UserContext.DefaultTransactionVisibility,
            UpdatedByUserProfileId = command.UserContext.UserProfileId,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Transactions.Add(transaction);
        await judgementReportRecalculationQueue.EnqueueAsync([ReportingSnapshot(transaction)], cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        RecordLifecycle("created", "expense");

        return await MapTransactionAsync(
            transaction,
            householdAccess.CurrencyCode,
            cancellationToken);
    }

    public async Task<TransactionModel> SaveIncomeAsync(
        SaveIncomeCommand command,
        CancellationToken cancellationToken)
    {
        var householdAccess = await householdAccessService.ResolveAsync(
            command.UserContext,
            command.RequestedHouseholdId,
            requireWrite: true,
            cancellationToken);
        var categoryId = await GetOrCreateCategoryIdAsync(
            GetIncomeCategoryName(command.Draft.Reason),
            CategoryType.Income,
            cancellationToken);
        var now = timeProvider.GetUtcNow();

        var transaction = new Transaction
        {
            HouseholdId = householdAccess.HouseholdId,
            UserProfileId = command.UserContext.UserProfileId,
            Amount = command.Draft.Amount!.Value,
            Type = TransactionType.Income,
            CategoryId = categoryId,
            // The existing schema stores a generic counterparty in MerchantName.
            // Income-facing contracts project this value as SenderName instead.
            MerchantName = NormalizeOptional(command.Draft.SenderName),
            Description = NormalizeOptional(command.Draft.Reason),
            SourceText = command.Draft.SourceText,
            TransactionDate = command.Draft.TransactionDate ?? command.UserContext.CurrentDate,
            InputMode = command.Draft.InputMode,
            Confidence = command.Draft.Confidence,
            Visibility = command.UserContext.DefaultTransactionVisibility,
            UpdatedByUserProfileId = command.UserContext.UserProfileId,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Transactions.Add(transaction);
        await judgementReportRecalculationQueue.EnqueueAsync([ReportingSnapshot(transaction)], cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        RecordLifecycle("created", "income");

        return await MapTransactionAsync(
            transaction,
            householdAccess.CurrencyCode,
            cancellationToken);
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
            cancellationToken);

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
            cancellationToken);
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

        var originalReportingSnapshot = ReportingSnapshot(transaction);

        var changes = new Dictionary<string, FieldChange>();

        if (command.Amount is not null && transaction.Amount != command.Amount.Value)
        {
            changes["amount"] = new FieldChange(transaction.Amount, command.Amount.Value);
            transaction.Amount = command.Amount.Value;
        }

        if (command.CategoryName is not null)
        {
            var categoryName = NormalizeOptional(command.CategoryName);
            var categoryType = transaction.Type == TransactionType.Income
                ? CategoryType.Income
                : CategoryType.Expense;
            var newCategoryId = await GetOrCreateCategoryIdAsync(
                categoryName,
                categoryType,
                cancellationToken);
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

            await judgementReportRecalculationQueue.EnqueueAsync(
                [originalReportingSnapshot, ReportingSnapshot(transaction)],
                cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            RecordLifecycle("updated", transaction.Type.ToString().ToLowerInvariant());
        }

        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            cancellationToken);
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

        var now = timeProvider.GetUtcNow();
        transaction.DeletedAt = now;
        transaction.DeletedByUserProfileId = userContext.UserProfileId;
        transaction.PurgeAfter = now.Add(TrashRetention);
        transaction.UpdatedAt = now;
        transaction.UpdatedByUserProfileId = userContext.UserProfileId;
        AddAudit(transaction.Id, userContext.UserProfileId, now, "deleted", false, true);
        await judgementReportRecalculationQueue.EnqueueAsync([ReportingSnapshot(transaction)], cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        RecordLifecycle("deleted", transaction.Type.ToString().ToLowerInvariant());
        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            cancellationToken);
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

        transaction.DeletedAt = null;
        transaction.DeletedByUserProfileId = null;
        transaction.PurgeAfter = null;
        transaction.UpdatedAt = now;
        transaction.UpdatedByUserProfileId = userContext.UserProfileId;
        AddAudit(transaction.Id, userContext.UserProfileId, now, "deleted", true, false);
        await judgementReportRecalculationQueue.EnqueueAsync([ReportingSnapshot(transaction)], cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        RecordLifecycle("restored", transaction.Type.ToString().ToLowerInvariant());
        return await MapTransactionAsync(
            transaction,
            await GetHouseholdCurrencyAsync(transaction.HouseholdId, cancellationToken),
            cancellationToken);
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
            await MapTransactionsAsync(transactions, access.CurrencyCode, cancellationToken));
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
        CancellationToken cancellationToken)
    {
        var mapped = await MapTransactionsAsync([transaction], currencyCode, cancellationToken);
        return mapped.Single();
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
            .Where(category => parentIds.Contains(category.Id))
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var userProfiles = await dbContext.UserProfiles
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
                    transaction.Type == TransactionType.Income ? null : transaction.MerchantName,
                    transaction.Type == TransactionType.Income ? null : transaction.Description,
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
                    SenderName = transaction.Type == TransactionType.Income ? transaction.MerchantName : null,
                    Reason = transaction.Type == TransactionType.Income ? transaction.Description : null,
                    DeletedAt = transaction.DeletedAt,
                    PurgeAfter = transaction.PurgeAfter,
                    ParentCategoryName = category?.ParentCategoryId is null
                        ? null
                        : parentNames.GetValueOrDefault(category.ParentCategoryId.Value),
                    CategoryClassification = category?.Classification
                };
            })
            .ToArray();
    }

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

    private static TransactionReportingSnapshot ReportingSnapshot(Transaction transaction) => new(
        transaction.HouseholdId,
        transaction.UserProfileId,
        transaction.TransactionDate,
        transaction.Visibility);

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
