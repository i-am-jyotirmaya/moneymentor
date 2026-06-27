using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class PostgresTransactionService(
    MoneyMentorDbContext dbContext) : ITransactionService
{
    private const int MaxListLimit = 100;

    public async Task<TransactionModel> SaveExpenseAsync(
        SaveExpenseCommand command,
        CancellationToken cancellationToken)
    {
        var householdId = await ResolveWritableHouseholdIdAsync(
            command.UserContext,
            command.RequestedHouseholdId,
            cancellationToken);
        var categoryId = await GetOrCreateExpenseCategoryIdAsync(
            command.Draft.CategoryGuess,
            cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var transaction = new Transaction
        {
            HouseholdId = householdId,
            UserProfileId = command.UserContext.UserProfileId,
            Amount = command.Draft.Amount!.Value,
            Type = TransactionType.Expense,
            CategoryId = categoryId,
            MerchantName = NormalizeOptional(command.Draft.MerchantName),
            Description = NormalizeOptional(command.Draft.Description),
            SourceText = command.Draft.SourceText,
            TransactionDate = ToUtcDate(command.Draft.TransactionDate),
            InputMode = command.Draft.InputMode,
            Confidence = command.Draft.Confidence,
            Visibility = command.UserContext.DefaultTransactionVisibility,
            UpdatedByUserProfileId = command.UserContext.UserProfileId,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Transactions.Add(transaction);
        await dbContext.SaveChangesAsync(cancellationToken);

        return await MapTransactionAsync(
            transaction,
            command.UserContext.CurrencyCode,
            cancellationToken);
    }

    public async Task<IReadOnlyCollection<TransactionModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        int limit,
        CancellationToken cancellationToken)
    {
        var householdIds = await GetActiveHouseholdIdsAsync(userContext.UserProfileId, cancellationToken);
        if (householdId is not null)
        {
            householdIds = householdIds.Contains(householdId.Value)
                ? [householdId.Value]
                : [];
        }

        var take = Math.Clamp(limit, 1, MaxListLimit);
        var transactions = await dbContext.Transactions
            .Where(transaction => householdIds.Contains(transaction.HouseholdId)
                && (transaction.UserProfileId == userContext.UserProfileId
                    || transaction.Visibility == TransactionVisibility.Household))
            .OrderByDescending(transaction => transaction.TransactionDate)
            .ThenByDescending(transaction => transaction.CreatedAt)
            .Take(take)
            .ToListAsync(cancellationToken);

        return await MapTransactionsAsync(
            transactions,
            userContext.CurrencyCode,
            cancellationToken);
    }

    public async Task<TransactionModel?> GetAsync(
        AppUserContext userContext,
        Guid transactionId,
        CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Transactions
            .FirstOrDefaultAsync(item => item.Id == transactionId, cancellationToken);

        if (transaction is null || !await CanViewAsync(transaction, userContext, cancellationToken))
        {
            return null;
        }

        return await MapTransactionAsync(
            transaction,
            userContext.CurrencyCode,
            cancellationToken);
    }

    public async Task<TransactionModel?> UpdateAsync(
        AppUserContext userContext,
        Guid transactionId,
        UpdateTransactionCommand command,
        CancellationToken cancellationToken)
    {
        var transaction = await dbContext.Transactions
            .FirstOrDefaultAsync(item => item.Id == transactionId, cancellationToken);

        if (transaction is null || !await CanEditAsync(transaction, userContext, cancellationToken))
        {
            return null;
        }

        var changes = new Dictionary<string, FieldChange>();

        if (command.Amount is not null && transaction.Amount != command.Amount.Value)
        {
            changes["amount"] = new FieldChange(transaction.Amount, command.Amount.Value);
            transaction.Amount = command.Amount.Value;
        }

        if (command.CategoryName is not null)
        {
            var categoryName = NormalizeOptional(command.CategoryName);
            var newCategoryId = await GetOrCreateExpenseCategoryIdAsync(categoryName, cancellationToken);
            if (transaction.CategoryId != newCategoryId)
            {
                changes["categoryName"] = new FieldChange(
                    await GetCategoryNameAsync(transaction.CategoryId, cancellationToken),
                    categoryName);
                transaction.CategoryId = newCategoryId;
            }
        }

        if (command.MerchantName is not null)
        {
            ApplyStringChange(changes, "merchantName", transaction.MerchantName, NormalizeOptional(command.MerchantName), value => transaction.MerchantName = value);
        }

        if (command.Description is not null)
        {
            ApplyStringChange(changes, "description", transaction.Description, NormalizeOptional(command.Description), value => transaction.Description = value);
        }

        if (command.TransactionDate is not null)
        {
            var transactionDate = ToUtcDate(command.TransactionDate);
            if (transaction.TransactionDate != transactionDate)
            {
                changes["transactionDate"] = new FieldChange(
                    ToDateOnly(transaction.TransactionDate),
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
            var now = DateTimeOffset.UtcNow;
            transaction.UpdatedAt = now;
            transaction.UpdatedByUserProfileId = userContext.UserProfileId;

            dbContext.TransactionAuditEntries.Add(new TransactionAuditEntry
            {
                TransactionId = transaction.Id,
                EditedByUserProfileId = userContext.UserProfileId,
                EditedAt = now,
                ChangedFieldsJson = JsonSerializer.Serialize(changes)
            });

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return await MapTransactionAsync(
            transaction,
            userContext.CurrencyCode,
            cancellationToken);
    }

    private async Task<Guid> ResolveWritableHouseholdIdAsync(
        AppUserContext userContext,
        Guid? requestedHouseholdId,
        CancellationToken cancellationToken)
    {
        if (requestedHouseholdId is null)
        {
            return userContext.PersonalHouseholdId;
        }

        var membership = await dbContext.HouseholdMembers
            .Join(
                dbContext.Households,
                member => member.HouseholdId,
                household => household.Id,
                (member, household) => new { Member = member, Household = household })
            .FirstOrDefaultAsync(
                item => item.Member.HouseholdId == requestedHouseholdId.Value
                    && item.Member.UserProfileId == userContext.UserProfileId
                    && item.Member.Status == HouseholdMemberStatus.Active,
                cancellationToken);

        if (membership is null)
        {
            throw new InvalidOperationException("The selected household is not available.");
        }

        if (membership.Household.Kind == HouseholdKind.Family && userContext.Plan != UserPlan.Premium)
        {
            throw new InvalidOperationException("Household tracking requires a Premium plan.");
        }

        return requestedHouseholdId.Value;
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

    private async Task<IReadOnlyCollection<Guid>> GetActiveHouseholdIdsAsync(
        Guid userProfileId,
        CancellationToken cancellationToken) =>
        await dbContext.HouseholdMembers
            .Where(member => member.UserProfileId == userProfileId
                && member.Status == HouseholdMemberStatus.Active)
            .Select(member => member.HouseholdId)
            .ToArrayAsync(cancellationToken);

    private async Task<Guid?> GetOrCreateExpenseCategoryIdAsync(
        string? categoryName,
        CancellationToken cancellationToken)
    {
        var normalizedName = NormalizeOptional(categoryName);
        if (normalizedName is null)
        {
            return null;
        }

        var normalizedNameLower = normalizedName.ToLowerInvariant();
        var category = await dbContext.Categories
            .FirstOrDefaultAsync(
                item => item.HouseholdId == null
                    && item.Type == CategoryType.Expense
                    && item.Name.ToLower() == normalizedNameLower,
                cancellationToken);

        if (category is not null)
        {
            return category.Id;
        }

        category = new Category
        {
            Name = normalizedName,
            Type = CategoryType.Expense,
            KeywordsJson = "[]",
            IsSystemCategory = true
        };

        dbContext.Categories.Add(category);
        await dbContext.SaveChangesAsync(cancellationToken);

        return category.Id;
    }

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
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var userProfiles = await dbContext.UserProfiles
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
                transaction.CategoryId is null ? null : categories.GetValueOrDefault(transaction.CategoryId.Value),
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

    private static DateTimeOffset ToUtcDate(DateOnly? date)
    {
        var resolvedDate = date ?? DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
        return new DateTimeOffset(
            DateTime.SpecifyKind(resolvedDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc));
    }

    private static DateOnly ToDateOnly(DateTimeOffset dateTimeOffset) =>
        DateOnly.FromDateTime(dateTimeOffset.UtcDateTime);

    private static string? NormalizeOptional(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }

    private sealed record FieldChange(object? Before, object? After);
}
