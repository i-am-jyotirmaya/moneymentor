using System.Globalization;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Domain.Enums;
namespace MoneyMentor.Application.Transactions;

public sealed class FinancialEventInputProcessor(IFinancialEventService events, IAppUserProfileService profiles,
    FinancialEventDraftStore drafts, TimeProvider clock, IFinancialAccountService accounts)
{
    public async Task<AssistantMessageResult?> TryProcessAsync(AssistantMessageCommand command, CancellationToken ct)
    {
        var text = command.Text.Trim();
        var pending = drafts.Get(command.AuthProvider, command.AuthSubject, command.HouseholdId);
        if (pending is not null && text.Equals("cancel", StringComparison.OrdinalIgnoreCase))
        {
            drafts.Clear(command.AuthProvider, command.AuthSubject, command.HouseholdId);
            return Reply("Cancelled the unfinished financial event.");
        }
        if (System.Text.RegularExpressions.Regex.IsMatch(text, @"^\s*(how|what|where|when|why|show|list)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return null;
        if (pending is not null && System.Text.RegularExpressions.Regex.IsMatch(text, @"^\s*(spent|bought|purchased|groceries|dinner|lunch)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
            && FinancialEventInterpreter.DetectKind(text) is null)
        {
            drafts.Clear(command.AuthProvider, command.AuthSubject, command.HouseholdId); return null;
        }
        TransactionIntent? intent = null;
        if (pending?.Intent is not null && pending.Candidates.Count > 0)
        {
            if (int.TryParse(text, out var selection) && selection >= 1 && selection <= pending.Candidates.Count)
                intent = pending.Intent with { RelatedTransactionId = pending.Candidates[selection - 1].Id };
            else if (text.Equals("unlinked", StringComparison.OrdinalIgnoreCase) && pending.Intent.EventKind == TransactionKind.Refund)
                intent = pending.Intent with { MatchOriginal = false };
            else if (FinancialEventInterpreter.DetectKind(text) is null)
                return Reply(BuildMatchQuestion(pending.Candidates), true);
        }
        if (intent is null)
        {
            // A clearly new transaction abandons a pending semantic clarification.
            var newKind = FinancialEventInterpreter.DetectKind(text);
            if (pending is not null && (newKind is null || new[] { "refund", "cashback", "income", "earned income", "reversal" }.Contains(text.ToLowerInvariant()))) text = pending.SourceText + " " + text;
            if (pending is not null && command.Text.Trim().Equals("income", StringComparison.OrdinalIgnoreCase)) text += " earned income";
            var kind = FinancialEventInterpreter.DetectKind(text);
            if (kind is null && System.Text.RegularExpressions.Regex.IsMatch(text, @"\bbill\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase)
                && System.Text.RegularExpressions.Regex.IsMatch(text, @"\b(paid|pay|payment)\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                var context = await ResolveUserAsync(command, ct);
                var known = await accounts.ListAsync(context, command.HouseholdId, ct);
                if (known.Any(x => x.IsActive && x.AccountType == FinancialAccountType.CreditCard && x.Aliases.Append(x.Name).Any(a =>
                    System.Text.RegularExpressions.Regex.IsMatch(text, $@"(?<![\p{{L}}\p{{N}}]){System.Text.RegularExpressions.Regex.Escape(a)}(?![\p{{L}}\p{{N}}])",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase)))) kind = TransactionKind.CreditCardPayment;
            }
            if (kind is null && !FinancialEventInterpreter.IsAmbiguousCredit(text)) return null;
            if (kind is null)
            {
                SavePending(command, text, null, []);
                return Reply("Was this a refund, cashback, or earned income? Reply with the event kind, or cancel.", true);
            }
            var user = await ResolveUserAsync(command, ct);
            // Reuse amount/date normalization. The prefix supplies expense evidence only;
            // it cannot decide the financial meaning or affect the retained source text.
            var parsed = await new HeuristicExpenseInputParser().ParseAsync(new ExpenseInputParseRequest(
                "spent " + text, command.AuthProvider, command.AuthSubject, command.HouseholdId, command.InputMode,
                command.TransactionDate, command.CurrencyCode, command.Locale, command.Email, command.DisplayName,
                user.CurrentDate), ct);
            if (parsed.Draft?.Amount is null)
            {
                SavePending(command, text, null, []);
                return Reply("What was the amount?", true);
            }
            intent = FinancialEventInterpreter.AddMetadata(new TransactionIntent(kind.Value, parsed.Draft.Amount.Value, parsed.Draft.TransactionDate)
            {
                HouseholdId = command.HouseholdId, SourceText = text, InputMode = command.InputMode,
                Merchant = kind is TransactionKind.Refund or TransactionKind.Reversal or TransactionKind.Cashback
                    ? FinancialEventInterpreter.RefundMerchant(text) ?? parsed.Draft.MerchantName : parsed.Draft.MerchantName,
                Description = parsed.Draft.Description, CategoryName = parsed.Draft.CategoryGuess
            }, text);
        }
        try
        {
            var user = await ResolveUserAsync(command, ct);
            var saved = await events.SaveAsync(user, intent, ct);
            drafts.Clear(command.AuthProvider, command.AuthSubject, command.HouseholdId);
            var label = saved.Kind?.ToString() ?? saved.Type.ToString();
            var effect = saved.FinancialImpact;
            var impactText = effect.Spending < 0 ? "Spending reduced." : effect.Spending == 0 && effect.Income == 0 ? "No new spending or earned income." : "";
            return new AssistantMessageResult(AssistantMessageStatus.Responded, FinanceInputIntent.CreateExpense,
                $"Tracked {saved.CurrencyCode} {saved.Amount.ToString("0.##", CultureInfo.InvariantCulture)} · {label}. {impactText}".Trim(),
                saved, null, null, []);
        }
        catch (TransactionMatchRequiredException match)
        {
            SavePending(command, text, intent, match.Candidates);
            return Reply(BuildMatchQuestion(match.Candidates), true);
        }
        catch (FinancialTransactionValidationException error)
        {
            SavePending(command, text, null, []);
            return Reply(error.Message, true);
        }
    }

    private Task<AppUserContext> ResolveUserAsync(AssistantMessageCommand command, CancellationToken ct) => profiles.ResolveAsync(
        new AppUserIdentity(command.AuthProvider, command.AuthSubject, command.Email, command.DisplayName), ct);
    private void SavePending(AssistantMessageCommand command, string text, TransactionIntent? intent, IReadOnlyList<TransactionMatchCandidate> candidates) =>
        drafts.Save(command.AuthProvider, command.AuthSubject, command.HouseholdId,
            new(text, intent, candidates, clock.GetUtcNow().AddMinutes(20)));
    private static AssistantMessageResult Reply(string message, bool clarify = false) => new(
        clarify ? AssistantMessageStatus.NeedsClarification : AssistantMessageStatus.Responded,
        FinanceInputIntent.ClarificationResponse, message, null, null, null, []);
    private static string BuildMatchQuestion(IReadOnlyList<TransactionMatchCandidate> candidates) =>
        "Which original transaction? " + string.Join("; ", candidates.Select((x, i) =>
            $"{i + 1}: {x.Date:yyyy-MM-dd} · {x.Merchant} · {x.Description} · {x.Amount:0.##}"))
        + ". Reply with its number, unlinked for a refund without a match, or cancel.";
}
