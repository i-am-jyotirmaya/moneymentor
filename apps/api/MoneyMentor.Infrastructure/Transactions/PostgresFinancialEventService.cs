using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Domain.Finance;
using MoneyMentor.Infrastructure.Categories;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class PostgresFinancialEventService(MoneyMentorDbContext db, IHouseholdAccessService access,
    PostgresFinancialAccountService accounts, TransactionModelMapper mapper, MerchantResolver merchants,
    JevTransactionCategorizer categorizer, DailyFinancialFactStore facts, TimeProvider clock,
    ILogger<PostgresFinancialEventService> logger) : IFinancialEventService
{
    public async Task<TransactionModel> SaveAsync(AppUserContext user, TransactionIntent intent, CancellationToken ct)
    {
        logger.LogInformation("Financial event capture started. EventKind={EventKind} InputMode={InputMode}", intent.EventKind, intent.InputMode);
        ValidateIntent(user, intent);
        var household = await access.ResolveAsync(user, intent.HouseholdId, true, ct);
        await using var unit = await db.Database.BeginTransactionAsync(ct);
        // Serialize linking, retries, edits and soft-deletes for a household. Day fact locks
        // are acquired afterwards in date order, avoiding competing over-refunds.
        await LockAsync(db, household.HouseholdId, ct);
        var account = await accounts.ResolveAsync(user, household.HouseholdId, intent.AccountId, intent.AccountAlias, ct);
        var counterparty = await accounts.ResolveAsync(user, household.HouseholdId, intent.CounterpartyAccountId, intent.CounterpartyAccountAlias, ct);
        ValidateAccounts(intent.EventKind, household.CurrencyCode, account, counterparty);
        var observationId = intent.ObservationAccountId ?? account?.Id;
        if (intent.ObservationAccountId is not null && intent.ObservationAccountId != account?.Id && intent.ObservationAccountId != counterparty?.Id)
            throw new FinancialTransactionValidationException("The observation account must be one of the event's accounts.");
        if (intent.ExternalReference is not null && account is null)
            throw new FinancialTransactionValidationException("An imported reference requires its financial account.");
        if (intent.ExternalReference is not null)
        {
            var prior = await db.Transactions.AsNoTracking().SingleOrDefaultAsync(x => x.HouseholdId == household.HouseholdId
                && x.ObservationAccountId == observationId && x.ExternalReference == intent.ExternalReference, ct);
            if (prior is not null)
            {
                if (prior.UserProfileId != user.UserProfileId || prior.DeletedAt != null)
                    throw new FinancialTransactionValidationException("That reference has already been recorded.");
                if (prior.Amount != intent.Amount || TransactionFinancialImpactCalculator.ResolveKind(prior.Type, prior.Kind) != intent.EventKind
                    || prior.CounterpartyAccountId != counterparty?.Id || prior.TransactionDate != (intent.Date ?? user.CurrentDate))
                    throw new FinancialTransactionValidationException("That reference already belongs to a different event.");
                logger.LogInformation("Financial event capture reused an existing event. CategorizationSkipReason={CategorizationSkipReason}", "duplicate_reference");
                return (await mapper.MapAsync([prior], household.CurrencyCode, user.UserProfileId, ct)).Single();
            }
        }
        var original = await FindOriginalAsync(user, household.HouseholdId, intent, account, ct);
        if (intent.EventKind == TransactionKind.Reversal && original is null)
            throw new FinancialTransactionValidationException("Select the original transaction to reverse.");
        if (original is not null)
        {
            if (original.UserProfileId != user.UserProfileId && household.Role is not (HouseholdRole.Owner or HouseholdRole.Admin))
                throw new HouseholdWriteForbiddenException();
            if ((intent.Date ?? user.CurrentDate) < original.TransactionDate)
                throw new FinancialTransactionValidationException("An adjustment cannot precede its original event.");
            await ValidateAdjustmentAsync(db, original, intent.EventKind, intent.Amount, null, ct);
        }
        var categoryType = intent.EventKind == TransactionKind.Income ? CategoryType.Income : CategoryType.Expense;
        Guid? categoryId = original?.CategoryId;
        if (original is null && intent.CategoryId is not null)
        {
            var selected = await db.Categories.AsNoTracking().FirstOrDefaultAsync(x => x.Id == intent.CategoryId && !x.IsHidden
                && x.Type == categoryType && (x.HouseholdId == null || x.HouseholdId == household.HouseholdId), ct)
                ?? throw new FinancialTransactionValidationException("Choose an available category for this event.");
            if (selected.ParentCategoryId is not null && !await db.Categories.AnyAsync(x => x.Id == selected.ParentCategoryId
                && !x.IsHidden && (x.HouseholdId == null || x.HouseholdId == household.HouseholdId), ct))
                throw new FinancialTransactionValidationException("Choose a category from an available group.");
            categoryId = selected.Id;
        }
        if (original is null && categoryId is null && intent.EventKind is TransactionKind.Purchase or TransactionKind.Income
            or TransactionKind.Refund or TransactionKind.Fee or TransactionKind.Interest or TransactionKind.Investment)
        {
            var fallback = intent.CategoryName ?? (intent.EventKind is TransactionKind.Fee or TransactionKind.Interest ? "Financial charges" : null);
            var name = fallback;
            var hasConsent = await db.PrivacyConsents.AsNoTracking().AnyAsync(x => x.UserProfileId == user.UserProfileId
                && x.PolicyVersion == PrivacyPolicy.CurrentVersion, ct);
            logger.LogInformation("Financial event categorization eligibility. EventKind={EventKind} HasCurrentAiConsent={HasCurrentAiConsent}",
                intent.EventKind, hasConsent);
            if (hasConsent)
                name = await categorizer.CategorizeAsync(categoryType, intent.Description, intent.Merchant, intent.SourceText, fallback, ct);
            else
            {
                MoneyMentorTelemetry.Categorization.Add(1, new KeyValuePair<string, object?>("outcome", "consent_missing_fallback"));
                logger.LogInformation("Jev categorization outcome: {CategorizationOutcome}. Current AI consent is missing.", "consent_missing_fallback");
            }
            categoryId = await CategoryPersistence.GetOrCreateSystemCategoryIdAsync(db, name, categoryType, ct);
        }
        else
        {
            logger.LogInformation("Jev categorization skipped. CategorizationSkipReason={CategorizationSkipReason}",
                original is not null ? "linked_original" : categoryId is not null ? "explicit_category" : "neutral_event");
        }
        var now = clock.GetUtcNow();
        var transaction = new Transaction
        {
            HouseholdId = household.HouseholdId, UserProfileId = original is null ? user.UserProfileId : original.UserProfileId,
            Amount = intent.Amount, Kind = intent.EventKind, Type = TransactionFinancialImpactCalculator.TypeFor(intent.EventKind),
            ReversedKind = intent.EventKind == TransactionKind.Reversal ? TransactionFinancialImpactCalculator.ResolveKind(original!.Type, original.Kind) : null,
            AccountId = account?.Id ?? original?.AccountId, CounterpartyAccountId = counterparty?.Id ?? original?.CounterpartyAccountId,
            PaymentChannel = intent.PaymentChannel, CategoryId = categoryId,
            MerchantName = original?.MerchantName ?? intent.Merchant?.Trim(), MerchantId = original?.MerchantId,
            EnrichmentJson = original?.EnrichmentJson, Description = intent.Description?.Trim(), SourceText = intent.SourceText,
            TransactionDate = intent.Date ?? user.CurrentDate, InputMode = intent.InputMode, Confidence = intent.Confidence,
            Visibility = original?.Visibility ?? intent.Visibility ?? user.DefaultTransactionVisibility,
            ExternalReference = intent.ExternalReference, ObservationAccountId = intent.ExternalReference is null ? null : observationId,
            UpdatedByUserProfileId = user.UserProfileId,
            CreatedAt = now, UpdatedAt = now
        };
        transaction.MerchantId ??= await merchants.ResolveAsync(household.HouseholdId, transaction.MerchantName, ct);
        db.Transactions.Add(transaction);
        if (original is not null) db.TransactionRelations.Add(new()
        {
            TransactionId = transaction.Id, RelatedTransactionId = original.Id,
            RelationType = intent.EventKind == TransactionKind.Refund ? TransactionRelationType.RefundOf : TransactionRelationType.ReversalOf,
            Amount = transaction.Amount, Confidence = intent.RelatedTransactionId is null ? 0.95m : 1m, CreatedAt = now
        });
        await MatchTransferPairAsync(transaction, ct);
        // Calculator validates the final persisted event, independent of parser/provider.
        _ = TransactionFinancialImpactCalculator.Calculate(transaction);
        await db.SaveChangesAsync(ct);
        await facts.RebuildAsync(transaction.HouseholdId, transaction.TransactionDate, ct);
        await unit.CommitAsync(ct);
        logger.LogInformation("Financial event capture committed. EventKind={EventKind} AccountResolved={AccountResolved} AccountType={AccountType} PaymentChannel={PaymentChannel} CategoryAssigned={CategoryAssigned}",
            transaction.Kind, transaction.AccountId is not null, account?.AccountType, transaction.PaymentChannel, transaction.CategoryId is not null);
        MoneyMentorTelemetry.TransactionLifecycle.Add(1, new KeyValuePair<string, object?>("operation", "created"),
            new KeyValuePair<string, object?>("type", transaction.Type.ToString().ToLowerInvariant()));
        return (await mapper.MapAsync([transaction], household.CurrencyCode, user.UserProfileId, ct)).Single();
    }

    internal static Task LockAsync(MoneyMentorDbContext db, Guid householdId, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync(
        $"SELECT pg_advisory_xact_lock(hashtextextended({"financial-events:" + householdId}, 0))", ct);

    internal static void ValidateIntent(AppUserContext user, TransactionIntent intent)
    {
        if (intent.SourceText is null || !Enum.IsDefined(intent.EventKind) || !Enum.IsDefined(intent.InputMode)
            || (intent.PaymentChannel is not null && !Enum.IsDefined(intent.PaymentChannel.Value))
            || (intent.Visibility is not null && !Enum.IsDefined(intent.Visibility.Value))
            || intent.Confidence < 0 || intent.Confidence > 1 || decimal.Round(intent.Confidence, 4) != intent.Confidence
            || intent.Amount <= 0 || intent.Amount > 999999999999m || decimal.Round(intent.Amount, 2) != intent.Amount
            || (intent.Date ?? user.CurrentDate) > user.CurrentDate
            || intent.SourceText.Length > 4000 || intent.Description?.Length > 1024 || intent.Merchant?.Length > 256
            || intent.ExternalReference?.Length > 128 || intent.CategoryName?.Length > 128
            || intent.AccountAlias?.Length > 128 || intent.CounterpartyAccountAlias?.Length > 128)
            throw new FinancialTransactionValidationException("Provide a supported event, positive amount with up to two decimals, and a date no later than today.");
        if (intent.RelatedTransactionId is not null && intent.EventKind is not (TransactionKind.Refund or TransactionKind.Reversal))
            throw new FinancialTransactionValidationException("Only refunds and reversals can select an original transaction.");
    }

    internal static void ValidateAccounts(TransactionKind kind, string currency, FinancialAccount? from, FinancialAccount? to)
    {
        if ((from is not null && from.CurrencyCode != currency) || (to is not null && to.CurrencyCode != currency))
            throw new FinancialTransactionValidationException("Accounts must use the household currency; conversion is not supported.");
        if (from is not null && from.Id == to?.Id)
            throw new FinancialTransactionValidationException("Source and destination accounts must differ.");
        if (kind == TransactionKind.CreditCardPayment && ((to is not null && to.AccountType != FinancialAccountType.CreditCard)
            || from?.AccountType == FinancialAccountType.CreditCard))
            throw new FinancialTransactionValidationException("A card bill payment goes from an asset account to a credit card.");
        if (kind == TransactionKind.CashWithdrawal && to is not null && to.AccountType != FinancialAccountType.Cash)
            throw new FinancialTransactionValidationException("A withdrawal's destination must be a cash account.");
        if (to is not null && kind is not (TransactionKind.Transfer or TransactionKind.CreditCardPayment or TransactionKind.CashWithdrawal or TransactionKind.Reversal))
            throw new FinancialTransactionValidationException("This event does not have a destination account.");
    }

    private async Task<Transaction?> FindOriginalAsync(AppUserContext user, Guid householdId, TransactionIntent intent, FinancialAccount? account, CancellationToken ct)
    {
        if (intent.EventKind is not (TransactionKind.Refund or TransactionKind.Reversal)) return null;
        var query = db.Transactions.Where(x => x.HouseholdId == householdId && x.DeletedAt == null
            && (x.UserProfileId == user.UserProfileId || x.Visibility == TransactionVisibility.Household));
        if (intent.RelatedTransactionId is not null)
            return await query.SingleOrDefaultAsync(x => x.Id == intent.RelatedTransactionId, ct)
                ?? throw new FinancialTransactionValidationException("The original transaction is not available to you.");
        if (!intent.MatchOriginal) return null;
        // Narrow by merchant/reference/account before applying bounded deterministic evidence.
        if (string.IsNullOrWhiteSpace(intent.Merchant)) return null;
        var date = intent.Date ?? user.CurrentDate;
        var merchant = intent.Merchant.Trim().ToLowerInvariant();
        var candidates = await query.Where(x => x.TransactionDate <= date && x.TransactionDate >= date.AddDays(-365)
            && x.MerchantName != null && x.MerchantName.ToLower() == merchant
            && (account == null || x.AccountId == account.Id)
            && x.Amount >= intent.Amount
            && (x.Kind == TransactionKind.Purchase || x.Kind == TransactionKind.Fee || x.Kind == TransactionKind.Interest
                || (x.Kind == null && x.Type == TransactionType.Expense)))
            .OrderByDescending(x => x.TransactionDate).Take(100).ToArrayAsync(ct);
        var candidateIds = candidates.Select(x => x.Id).ToArray();
        var usedAmounts = await (from relation in db.TransactionRelations.AsNoTracking()
            join adjustment in db.Transactions.AsNoTracking() on relation.TransactionId equals adjustment.Id
            where candidateIds.Contains(relation.RelatedTransactionId) && adjustment.DeletedAt == null
                && (relation.RelationType == TransactionRelationType.RefundOf || relation.RelationType == TransactionRelationType.ReversalOf)
            group adjustment by relation.RelatedTransactionId into adjustments
            select new { Id = adjustments.Key, Amount = adjustments.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount, ct);
        var eligible = candidates.Where(x => x.Amount - usedAmounts.GetValueOrDefault(x.Id) >= intent.Amount).ToList();
        if (eligible.Count == 0) return null;
        // A unique merchant + amount + description/account match can link automatically.
        var strong = eligible.Where(x => x.Amount == intent.Amount
            && (account is not null || DescriptionOverlap(x.Description, intent.Description, intent.Merchant))).ToArray();
        if (strong.Length == 1) return strong[0];
        throw new TransactionMatchRequiredException(eligible.Take(5)
            .Select(x => new TransactionMatchCandidate(x.Id, x.Amount, x.TransactionDate, x.MerchantName, x.Description)).ToArray());
    }

    private static bool DescriptionOverlap(string? original, string? current, string? merchant)
    {
        if (original is null || current is null) return false;
        var ignored = new HashSet<string>(["refund", "refunded", "reversal", "reversed", "amazon", "from", "for", "the", "paid", "received", "bought", "purchase"]);
        if (merchant is not null) foreach (System.Text.RegularExpressions.Match word in System.Text.RegularExpressions.Regex.Matches(merchant.ToLowerInvariant(), @"[\p{L}]+")) ignored.Add(word.Value);
        var words = System.Text.RegularExpressions.Regex.Matches(original.ToLowerInvariant(), @"[\p{L}]{4,}")
            .Select(x => x.Value).Where(x => !ignored.Contains(x));
        return words.Any(x => System.Text.RegularExpressions.Regex.IsMatch(current, $@"\b{System.Text.RegularExpressions.Regex.Escape(x)}\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase));
    }

    internal static async Task<decimal> RemainingAsync(MoneyMentorDbContext db, Transaction original, Guid? excludingId, CancellationToken ct)
    {
        var used = await (from relation in db.TransactionRelations
            join adjustment in db.Transactions on relation.TransactionId equals adjustment.Id
            where relation.RelatedTransactionId == original.Id && adjustment.DeletedAt == null && adjustment.Id != excludingId
                && (relation.RelationType == TransactionRelationType.RefundOf || relation.RelationType == TransactionRelationType.ReversalOf)
            select adjustment.Amount).SumAsync(ct);
        return original.Amount - used;
    }

    internal static async Task ValidateAdjustmentAsync(MoneyMentorDbContext db, Transaction original, TransactionKind kind,
        decimal amount, Guid? excludingId, CancellationToken ct)
    {
        var originalKind = TransactionFinancialImpactCalculator.ResolveKind(original.Type, original.Kind);
        if (original.DeletedAt != null || originalKind == TransactionKind.Reversal)
            throw new FinancialTransactionValidationException("An active original event is required; a reversal cannot reverse another reversal.");
        if (kind == TransactionKind.Refund && originalKind is not (TransactionKind.Purchase or TransactionKind.Fee or TransactionKind.Interest))
            throw new FinancialTransactionValidationException("Refunds must link to a purchase, fee, or interest charge.");
        if (amount > await RemainingAsync(db, original, excludingId, ct))
            throw new FinancialTransactionValidationException("The adjustment exceeds the original transaction's remaining amount.");
    }

    private async Task MatchTransferPairAsync(Transaction current, CancellationToken ct)
    {
        if (current.Kind is not (TransactionKind.Transfer or TransactionKind.CreditCardPayment or TransactionKind.CashWithdrawal)
            || current.AccountId is null || current.CounterpartyAccountId is null || current.ExternalReference is null) return;
        // Only an exact reference and the same known account pair can establish two
        // observations of one economic event. Similar amounts alone are insufficient.
        var candidates = await db.Transactions.Where(x => x.HouseholdId == current.HouseholdId && x.DeletedAt == null
            && x.UserProfileId == current.UserProfileId && x.Kind == current.Kind && x.Amount == current.Amount
            && x.ExternalReference == current.ExternalReference
            && x.TransactionDate >= current.TransactionDate.AddDays(-3) && x.TransactionDate <= current.TransactionDate.AddDays(3)
            && ((x.AccountId == current.AccountId && x.CounterpartyAccountId == current.CounterpartyAccountId
                && x.ObservationAccountId != current.ObservationAccountId)
                || (x.AccountId == current.CounterpartyAccountId && x.CounterpartyAccountId == current.AccountId)))
            .Take(2).ToArrayAsync(ct);
        if (candidates.Length == 1 && !await db.TransactionRelations.AnyAsync(x => x.RelationType == TransactionRelationType.TransferPair
            && (x.TransactionId == candidates[0].Id || x.RelatedTransactionId == candidates[0].Id), ct)) db.TransactionRelations.Add(new() { TransactionId = current.Id,
            RelatedTransactionId = candidates[0].Id, RelationType = TransactionRelationType.TransferPair, Amount = current.Amount, Confidence = 1m });
    }
}
