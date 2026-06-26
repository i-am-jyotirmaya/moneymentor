using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.InputParsing;

public sealed class ExpenseInputProcessor(
    IExpenseInputParser parser,
    IExpenseInputDraftStore draftStore) : IExpenseInputProcessor
{
    public async Task<ExpenseInputParseResult> ProcessAsync(
        ExpenseInputParseRequest request,
        CancellationToken cancellationToken)
    {
        var currentResult = await parser.ParseAsync(request, cancellationToken);

        if (currentResult.Status is ExpenseInputParseStatus.Failed or ExpenseInputParseStatus.Unsupported)
        {
            return currentResult;
        }

        if (currentResult.Draft is null)
        {
            return currentResult;
        }

        var pendingDraft = draftStore.Get(request);
        if (pendingDraft is null)
        {
            StoreIfNeedsClarification(request, currentResult);
            return currentResult;
        }

        if (currentResult.Status == ExpenseInputParseStatus.Parsed)
        {
            draftStore.Clear(request);
            return currentResult;
        }

        var mergedDraft = MergeDrafts(pendingDraft, currentResult.Draft, request);
        var mergedResult = BuildResultFromMergedDraft(mergedDraft);

        if (mergedResult.Status == ExpenseInputParseStatus.Parsed)
        {
            draftStore.Clear(request);
        }
        else
        {
            draftStore.Save(request, mergedDraft);
        }

        return mergedResult;
    }

    private void StoreIfNeedsClarification(
        ExpenseInputParseRequest request,
        ExpenseInputParseResult result)
    {
        if (result.Status == ExpenseInputParseStatus.NeedsClarification && result.Draft is not null)
        {
            draftStore.Save(request, result.Draft);
        }
    }

    private static ExpenseDraft MergeDrafts(
        ExpenseDraft pendingDraft,
        ExpenseDraft currentDraft,
        ExpenseInputParseRequest request)
    {
        var amount = currentDraft.Amount ?? pendingDraft.Amount;
        var categoryGuess = ChooseText(currentDraft.CategoryGuess, pendingDraft.CategoryGuess);
        var merchantName = ChooseText(currentDraft.MerchantName, pendingDraft.MerchantName);
        var description = ChooseText(currentDraft.Description, pendingDraft.Description);
        var transactionDate = currentDraft.TransactionDate ?? pendingDraft.TransactionDate ?? request.TransactionDate;
        var confidence = CalculateMergedConfidence(pendingDraft, currentDraft, amount, categoryGuess, merchantName, description);

        return new ExpenseDraft(
            amount,
            categoryGuess,
            merchantName,
            description,
            transactionDate,
            CombineSourceText(pendingDraft.SourceText, currentDraft.SourceText),
            currentDraft.InputMode,
            confidence,
            GetMissingFields(amount, categoryGuess, merchantName, description, transactionDate, request.HouseholdId));
    }

    private static ExpenseInputParseResult BuildResultFromMergedDraft(ExpenseDraft draft)
    {
        if (draft.Amount is null && HasExpenseEvidence(draft))
        {
            return ExpenseInputParseResult.NeedsClarification(
                draft,
                ExpenseInputAssistantMessages.BuildMissingAmountMessage(draft));
        }

        if (draft.Amount is not null && !HasExpenseEvidence(draft))
        {
            return ExpenseInputParseResult.NeedsClarification(
                draft,
                "What was this expense for?");
        }

        if (draft.Amount is null)
        {
            return ExpenseInputParseResult.Unsupported("I could not identify an expense amount or expense details in that input.");
        }

        return ExpenseInputParseResult.Parsed(
            draft,
            ExpenseInputAssistantMessages.BuildParsedExpenseMessage(draft));
    }

    private static bool HasExpenseEvidence(ExpenseDraft draft) =>
        !string.IsNullOrWhiteSpace(draft.CategoryGuess)
        || !string.IsNullOrWhiteSpace(draft.MerchantName)
        || !string.IsNullOrWhiteSpace(draft.Description);

    private static string? ChooseText(string? currentValue, string? pendingValue)
    {
        if (string.IsNullOrWhiteSpace(currentValue))
        {
            return string.IsNullOrWhiteSpace(pendingValue) ? null : pendingValue;
        }

        return currentValue;
    }

    private static string CombineSourceText(string pendingSourceText, string currentSourceText)
    {
        if (string.Equals(pendingSourceText, currentSourceText, StringComparison.Ordinal))
        {
            return pendingSourceText;
        }

        return $"{pendingSourceText}\n{currentSourceText}";
    }

    private static decimal CalculateMergedConfidence(
        ExpenseDraft pendingDraft,
        ExpenseDraft currentDraft,
        decimal? amount,
        string? categoryGuess,
        string? merchantName,
        string? description)
    {
        var confidence = Math.Max(pendingDraft.Confidence, currentDraft.Confidence);

        if (amount is not null)
        {
            confidence += 0.20m;
        }

        if (!string.IsNullOrWhiteSpace(categoryGuess))
        {
            confidence += 0.08m;
        }

        if (!string.IsNullOrWhiteSpace(merchantName))
        {
            confidence += 0.04m;
        }

        if (!string.IsNullOrWhiteSpace(description))
        {
            confidence += 0.08m;
        }

        return decimal.Round(Math.Clamp(confidence, 0m, 0.98m), 4);
    }

    private static IReadOnlyCollection<ExpenseDraftMissingField> GetMissingFields(
        decimal? amount,
        string? categoryGuess,
        string? merchantName,
        string? description,
        DateOnly? transactionDate,
        Guid? householdId)
    {
        var missingFields = new List<ExpenseDraftMissingField>();

        if (amount is null)
        {
            missingFields.Add(ExpenseDraftMissingField.Amount);
        }

        if (string.IsNullOrWhiteSpace(categoryGuess))
        {
            missingFields.Add(ExpenseDraftMissingField.Category);
        }

        if (string.IsNullOrWhiteSpace(merchantName))
        {
            missingFields.Add(ExpenseDraftMissingField.Merchant);
        }

        if (string.IsNullOrWhiteSpace(description))
        {
            missingFields.Add(ExpenseDraftMissingField.Description);
        }

        if (transactionDate is null)
        {
            missingFields.Add(ExpenseDraftMissingField.TransactionDate);
        }

        if (householdId is null)
        {
            missingFields.Add(ExpenseDraftMissingField.Household);
        }

        return missingFields;
    }
}
