using System.Globalization;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Application.InputParsing;

public sealed class IncomeInputProcessor(
    IIncomeInputParser parser,
    IAppUserProfileService appUserProfileService,
    IIncomeInputDraftStore draftStore,
    ITransactionService transactionService) : IIncomeInputProcessor
{
    public bool HasPendingDraft(IncomeInputParseRequest request) =>
        draftStore.Get(request) is not null;

    public async Task<IncomeInputProcessResult> ProcessAsync(
        IncomeInputParseRequest request,
        CancellationToken cancellationToken)
    {
        var parseResult = await parser.ParseAsync(request, cancellationToken);
        if (parseResult.Status == IncomeInputParseStatus.Failed)
        {
            return IncomeInputProcessResult.FromParseResult(parseResult);
        }

        var pendingDraft = draftStore.Get(request);
        if (pendingDraft is not null && parseResult.Draft is not null)
        {
            var mergedDraft = MergeDrafts(pendingDraft, parseResult.Draft, request);
            var mergedResult = BuildResultFromMergedDraft(mergedDraft);

            if (mergedResult.Status == IncomeInputParseStatus.Parsed)
            {
                return await SaveAsync(request, mergedDraft, cancellationToken);
            }

            draftStore.Save(request, mergedDraft);
            return IncomeInputProcessResult.FromParseResult(mergedResult);
        }

        if (parseResult.Status == IncomeInputParseStatus.NeedsClarification
            && parseResult.Draft is not null)
        {
            draftStore.Save(request, parseResult.Draft);
            return IncomeInputProcessResult.FromParseResult(parseResult);
        }

        if (parseResult.Status != IncomeInputParseStatus.Parsed || parseResult.Draft is null)
        {
            return IncomeInputProcessResult.FromParseResult(parseResult);
        }

        return await SaveAsync(request, parseResult.Draft, cancellationToken);
    }

    private async Task<IncomeInputProcessResult> SaveAsync(
        IncomeInputParseRequest request,
        IncomeDraft draft,
        CancellationToken cancellationToken)
    {
        var userContext = await appUserProfileService.ResolveAsync(
            new AppUserIdentity(
                request.AuthProvider,
                request.AuthSubject,
                request.Email,
                request.DisplayName),
            cancellationToken);
        var transaction = await transactionService.SaveIncomeAsync(
            new SaveIncomeCommand(userContext, draft, request.HouseholdId),
            cancellationToken);

        draftStore.Clear(request);
        return IncomeInputProcessResult.Saved(
            draft,
            transaction,
            BuildSavedMessage(transaction));
    }

    private static IncomeDraft MergeDrafts(
        IncomeDraft pendingDraft,
        IncomeDraft currentDraft,
        IncomeInputParseRequest request)
    {
        var amount = currentDraft.Amount ?? pendingDraft.Amount;
        var senderName = ChooseText(currentDraft.SenderName, pendingDraft.SenderName);
        var reason = ChooseText(currentDraft.Reason, pendingDraft.Reason);
        var transactionDate = currentDraft.TransactionDate
            ?? pendingDraft.TransactionDate
            ?? request.TransactionDate;
        var confidence = decimal.Round(
            Math.Clamp(
                Math.Max(pendingDraft.Confidence, currentDraft.Confidence)
                    + (amount is null ? 0m : 0.20m)
                    + (senderName is null ? 0m : 0.05m)
                    + (reason is null ? 0m : 0.05m),
                0m,
                0.98m),
            4);

        return new IncomeDraft(
            amount,
            senderName,
            reason,
            transactionDate,
            CombineSourceText(pendingDraft.SourceText, currentDraft.SourceText),
            currentDraft.InputMode,
            confidence,
            GetMissingFields(amount, senderName, reason, transactionDate));
    }

    private static IncomeInputParseResult BuildResultFromMergedDraft(IncomeDraft draft)
    {
        if (draft.Amount is null)
        {
            return IncomeInputParseResult.NeedsClarification(
                draft,
                IncomeInputAssistantMessages.BuildMissingAmountMessage(draft));
        }

        if (string.IsNullOrWhiteSpace(draft.SenderName)
            && string.IsNullOrWhiteSpace(draft.Reason))
        {
            return IncomeInputParseResult.NeedsClarification(
                draft,
                "Who sent this income, or what was it for?");
        }

        return IncomeInputParseResult.Parsed(
            draft,
            IncomeInputAssistantMessages.BuildParsedMessage(draft));
    }

    private static string? ChooseText(string? currentValue, string? pendingValue) =>
        !string.IsNullOrWhiteSpace(currentValue)
            ? currentValue
            : string.IsNullOrWhiteSpace(pendingValue) ? null : pendingValue;

    private static string CombineSourceText(string pendingSourceText, string currentSourceText) =>
        string.Equals(pendingSourceText, currentSourceText, StringComparison.Ordinal)
            ? pendingSourceText
            : $"{pendingSourceText}\n{currentSourceText}";

    private static IReadOnlyCollection<IncomeDraftMissingField> GetMissingFields(
        decimal? amount,
        string? senderName,
        string? reason,
        DateOnly? transactionDate)
    {
        var missingFields = new List<IncomeDraftMissingField>();
        if (amount is null)
        {
            missingFields.Add(IncomeDraftMissingField.Amount);
        }

        if (string.IsNullOrWhiteSpace(senderName))
        {
            missingFields.Add(IncomeDraftMissingField.Sender);
        }

        if (string.IsNullOrWhiteSpace(reason))
        {
            missingFields.Add(IncomeDraftMissingField.Reason);
        }

        if (transactionDate is null)
        {
            missingFields.Add(IncomeDraftMissingField.TransactionDate);
        }

        return missingFields;
    }

    private static string BuildSavedMessage(TransactionModel transaction)
    {
        var sender = string.IsNullOrWhiteSpace(transaction.SenderName)
            ? string.Empty
            : $" from {transaction.SenderName}";
        var reason = string.IsNullOrWhiteSpace(transaction.Reason)
            ? string.Empty
            : $" for {transaction.Reason}";

        return $"Tracked {FormatAmount(transaction.Amount, transaction.CurrencyCode)} received{sender}{reason}.";
    }

    private static string FormatAmount(decimal amount, string currencyCode)
    {
        var formattedAmount = amount.ToString("0.##", CultureInfo.InvariantCulture);
        return string.Equals(currencyCode, "INR", StringComparison.OrdinalIgnoreCase)
            ? $"₹{formattedAmount}"
            : $"{currencyCode.ToUpperInvariant()} {formattedAmount}";
    }
}
