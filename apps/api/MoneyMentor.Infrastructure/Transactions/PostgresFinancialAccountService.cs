using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class PostgresFinancialAccountService(MoneyMentorDbContext db, IHouseholdAccessService access,
    TimeProvider clock, ILogger<PostgresFinancialAccountService> logger) : IFinancialAccountService
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
        if (id is null && string.IsNullOrWhiteSpace(alias))
        {
            logger.LogInformation("Financial account resolution: {AccountResolutionOutcome}.", "not_requested");
            return null;
        }
        var candidates = await Visible(householdId, user.UserProfileId).Where(x => x.IsActive).ToArrayAsync(ct);
        if (id is not null)
        {
            var selected = candidates.SingleOrDefault(x => x.Id == id);
            logger.LogInformation("Financial account resolution: {AccountResolutionOutcome}. AccountType={AccountType}",
                selected is null ? "id_unavailable" : "id_matched", selected?.AccountType);
            return selected ?? throw new FinancialTransactionValidationException("Choose an active account belonging to this household and available to you.");
        }
        var ids = candidates.Select(x => x.Id).ToArray();
        var aliases = await db.FinancialAccountAliases.Where(x => ids.Contains(x.FinancialAccountId)).ToArrayAsync(ct);
        static string Normalize(string value) => Regex.Replace(value.Trim(), @"\s+", " ");
        static string WithoutCardDescriptor(string value) => Regex.Replace(value,
            @"\s+(?:credit[ -]?card|card)$", "", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant).Trim();
        var search = Normalize(alias!);
        var outcome = "exact_matched";
        FinancialAccount[] matches;
        while (true)
        {
            matches = candidates.Where(x => string.Equals(Normalize(x.Name), search, StringComparison.OrdinalIgnoreCase)
                || aliases.Any(a => a.FinancialAccountId == x.Id && string.Equals(Normalize(a.Alias), search, StringComparison.OrdinalIgnoreCase))).ToArray();
            if (matches.Length > 0) break;
            // A saved "Kotak Upi Card" can be named "Kotak upi" in chat.
            // Match that distinctive name before discarding channel words from the input.
            // Restrict optional card descriptors to accounts explicitly stored as credit cards.
            matches = candidates.Where(x => x.AccountType == FinancialAccountType.CreditCard
                && (string.Equals(WithoutCardDescriptor(Normalize(x.Name)), search, StringComparison.OrdinalIgnoreCase)
                    || aliases.Any(a => a.FinancialAccountId == x.Id
                        && string.Equals(WithoutCardDescriptor(Normalize(a.Alias)), search, StringComparison.OrdinalIgnoreCase)))).ToArray();
            if (matches.Length > 0)
            {
                outcome = outcome == "exact_matched" ? "card_descriptor_matched" : "suffix_card_descriptor_matched";
                break;
            }
            // Strip only trailing payment metadata, one suffix at a time. Try the
            // longest remaining alias first, so "Kotak upi card" still selects the card.
            var shortened = Regex.Replace(search, @"\s+(?:credit[ -]?card|card|account|upi|cash|bank\s+transfer|auto\s?debit)$",
                "", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant).Trim();
            if (shortened == search) break;
            search = shortened;
            outcome = "suffix_matched";
        }
        logger.LogInformation("Financial account resolution: {AccountResolutionOutcome}. MatchCount={AccountMatchCount} AccountType={AccountType}",
            matches.Length == 0 ? "unmatched" : matches.Length > 1 ? "ambiguous" : outcome,
            matches.Length, matches.Length == 1 ? matches[0].AccountType : (FinancialAccountType?)null);
        if (matches.Length == 0) return null; // Unknown text aliases never force account setup for ordinary tracking.
        if (matches.Length != 1) throw new FinancialTransactionValidationException($"'{alias}' matches more than one account. Use its full name.");
        return matches[0];
    }
    private static FinancialAccountModel Map(FinancialAccount x, IReadOnlyCollection<string> aliases) =>
        new(x.Id, x.HouseholdId, x.OwnerUserProfileId, x.Name, x.AccountType, x.Institution, x.Last4, x.CurrencyCode, x.IsActive, aliases);
}
