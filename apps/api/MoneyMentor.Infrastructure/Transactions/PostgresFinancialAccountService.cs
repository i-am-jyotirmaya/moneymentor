using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class PostgresFinancialAccountService(MoneyMentorDbContext db, IHouseholdAccessService access,
    TimeProvider clock) : IFinancialAccountService
{
    internal IQueryable<FinancialAccount> Visible(Guid householdId, Guid userId) => db.FinancialAccounts.Where(x =>
        x.HouseholdId == householdId && (x.OwnerUserProfileId == null || x.OwnerUserProfileId == userId));

    public async Task<IReadOnlyCollection<FinancialAccountModel>> ListAsync(AppUserContext user, Guid? householdId, CancellationToken ct)
    {
        var household = await access.ResolveAsync(user, householdId, false, ct);
        var accounts = await Visible(household.HouseholdId, user.UserProfileId).AsNoTracking().OrderBy(x => x.Name).ToArrayAsync(ct);
        var ids = accounts.Select(x => x.Id).ToArray();
        var aliases = await db.FinancialAccountAliases.AsNoTracking().Where(x => ids.Contains(x.FinancialAccountId)).ToArrayAsync(ct);
        return accounts.Select(x => Map(x, aliases.Where(a => a.FinancialAccountId == x.Id).Select(a => a.Alias).ToArray())).ToArray();
    }

    public async Task<FinancialAccountModel> SaveAsync(AppUserContext user, Guid? id, SaveFinancialAccountCommand command, CancellationToken ct)
    {
        var household = await access.ResolveAsync(user, command.HouseholdId, true, ct);
        if (string.IsNullOrWhiteSpace(command.Name) || command.Name.Trim().Length > 128 || !Enum.IsDefined(command.AccountType)
            || command.Institution?.Length > 128 || command.Aliases is null || command.Aliases.Count > 20
            || command.Aliases.Any(x => string.IsNullOrWhiteSpace(x) || x.Length > 128)
            || (command.Last4 is not null && !Regex.IsMatch(command.Last4, @"^\d{4}$")))
            throw new FinancialTransactionValidationException("Provide a name, supported account type, at most 20 aliases, and optionally four trailing digits.");
        await using var unit = await db.Database.BeginTransactionAsync(ct);
        await PostgresFinancialEventService.LockAsync(db, household.HouseholdId, ct);
        var account = id is null ? new FinancialAccount { HouseholdId = household.HouseholdId,
            OwnerUserProfileId = command.Shared ? null : user.UserProfileId, CurrencyCode = household.CurrencyCode,
            CreatedAt = clock.GetUtcNow() } : await Visible(household.HouseholdId, user.UserProfileId).FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new FinancialTransactionValidationException("Account was not found.");
        if (id is not null) await db.Entry(account).ReloadAsync(ct);
        // Sharing is chosen at creation. It must not silently publish private transaction account metadata.
        if (id is not null && (account.OwnerUserProfileId == null) != command.Shared)
            throw new FinancialTransactionValidationException("Account sharing cannot be changed after creation.");
        if (account.OwnerUserProfileId == null && household.Role is not (HouseholdRole.Owner or HouseholdRole.Admin))
            throw new HouseholdWriteForbiddenException();
        if (id is not null && account.AccountType != command.AccountType && await db.Transactions.AnyAsync(
            x => x.AccountId == id || x.CounterpartyAccountId == id, ct))
            throw new FinancialTransactionValidationException("The type of an account used in transactions cannot be changed.");
        account.Name = command.Name.Trim(); account.AccountType = command.AccountType;
        account.Institution = command.Institution?.Trim(); account.Last4 = command.Last4;
        account.IsActive = command.IsActive; account.UpdatedAt = clock.GetUtcNow();
        if (id is null) db.FinancialAccounts.Add(account);
        var aliases = command.Aliases.Select(x => x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var oldAliases = id is null ? [] : await db.FinancialAccountAliases.Where(x => x.FinancialAccountId == account.Id).ToArrayAsync(ct);
        db.FinancialAccountAliases.RemoveRange(oldAliases.Where(x => !aliases.Contains(x.Alias, StringComparer.OrdinalIgnoreCase)));
        foreach (var alias in aliases.Where(x => !oldAliases.Any(a => string.Equals(a.Alias, x, StringComparison.OrdinalIgnoreCase))))
            db.FinancialAccountAliases.Add(new() { FinancialAccountId = account.Id, Alias = alias });
        await db.SaveChangesAsync(ct);
        await unit.CommitAsync(ct);
        return Map(account, aliases);
    }

    internal async Task<FinancialAccount?> ResolveAsync(AppUserContext user, Guid householdId, Guid? id, string? alias, CancellationToken ct)
    {
        if (id is null && string.IsNullOrWhiteSpace(alias)) return null;
        var candidates = await Visible(householdId, user.UserProfileId).Where(x => x.IsActive).ToArrayAsync(ct);
        if (id is not null) return candidates.SingleOrDefault(x => x.Id == id)
            ?? throw new FinancialTransactionValidationException("Choose an active account belonging to this household and available to you.");
        var ids = candidates.Select(x => x.Id).ToArray();
        var aliases = await db.FinancialAccountAliases.Where(x => ids.Contains(x.FinancialAccountId)).ToArrayAsync(ct);
        var matches = candidates.Where(x => string.Equals(x.Name, alias!.Trim(), StringComparison.OrdinalIgnoreCase)
            || aliases.Any(a => a.FinancialAccountId == x.Id && string.Equals(a.Alias, alias.Trim(), StringComparison.OrdinalIgnoreCase))).ToArray();
        if (matches.Length == 0) return null; // Unknown text aliases never force account setup for ordinary tracking.
        if (matches.Length != 1) throw new FinancialTransactionValidationException(matches.Length == 0
            ? $"No account matches '{alias}'. Add it in Financial accounts, or track without an account."
            : $"'{alias}' matches more than one account. Use its full name.");
        return matches[0];
    }
    private static FinancialAccountModel Map(FinancialAccount x, IReadOnlyCollection<string> aliases) =>
        new(x.Id, x.HouseholdId, x.OwnerUserProfileId, x.Name, x.AccountType, x.Institution, x.Last4, x.CurrencyCode, x.IsActive, aliases);
}
