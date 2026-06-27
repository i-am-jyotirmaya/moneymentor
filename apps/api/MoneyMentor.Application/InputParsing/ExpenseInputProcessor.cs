using System.Globalization;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Application.InputParsing;

public sealed class ExpenseInputProcessor(
    IExpenseInputParser parser,
    IAppUserProfileService appUserProfileService,
    IExpenseInputDraftStore draftStore,
    ITransactionService transactionService) : IExpenseInputProcessor
{
    public async Task<ExpenseInputProcessResult> ProcessAsync(
        ExpenseInputParseRequest request,
        CancellationToken cancellationToken)
    {
        var parseResult = await parser.ParseAsync(request, cancellationToken);

        if (parseResult.Status is ExpenseInputParseStatus.Failed or ExpenseInputParseStatus.Unsupported)
        {
            return ExpenseInputProcessResult.FromParseResult(parseResult);
        }

        if (parseResult.Draft is null)
        {
            return ExpenseInputProcessResult.FromParseResult(parseResult);
        }

        var pendingDraft = draftStore.Get(request);
        var userContext = await appUserProfileService.ResolveAsync(
            new AppUserIdentity(
                request.AuthProvider,
                request.AuthSubject,
                request.Email,
                request.DisplayName),
            cancellationToken);

        if (pendingDraft is not null && parseResult.Status == ExpenseInputParseStatus.Parsed)
        {
            if (ShouldMergeParsedResponse(pendingDraft, parseResult.Draft))
            {
                return await SaveParsedExpenseAsync(
                    request,
                    userContext,
                    MergeDrafts(pendingDraft, parseResult.Draft, request),
                    cancellationToken);
            }

            draftStore.Clear(request);
            return await SaveParsedExpenseAsync(
                request,
                userContext,
                parseResult.Draft,
                cancellationToken);
        }

        if (pendingDraft is not null)
        {
            var mergedDraft = MergeDrafts(pendingDraft, parseResult.Draft, request);
            var mergedResult = BuildResultFromMergedDraft(mergedDraft);

            if (mergedResult.Status == ExpenseInputParseStatus.Parsed)
            {
                return await SaveParsedExpenseAsync(
                    request,
                    userContext,
                    mergedDraft,
                    cancellationToken);
            }

            draftStore.Save(request, mergedDraft);
            return ExpenseInputProcessResult.FromParseResult(mergedResult);
        }

        if (parseResult.Status == ExpenseInputParseStatus.NeedsClarification)
        {
            draftStore.Save(request, parseResult.Draft);
            return ExpenseInputProcessResult.FromParseResult(parseResult);
        }

        return await SaveParsedExpenseAsync(
            request,
            userContext,
            parseResult.Draft,
            cancellationToken);
    }

    private async Task<ExpenseInputProcessResult> SaveParsedExpenseAsync(
        ExpenseInputParseRequest request,
        AppUserContext userContext,
        ExpenseDraft draft,
        CancellationToken cancellationToken)
    {
        if (userContext.RequireMerchantForExpenses
            && string.IsNullOrWhiteSpace(draft.MerchantName))
        {
            draftStore.Save(request, draft);
            return ExpenseInputProcessResult.NeedsClarification(
                draft,
                "Which merchant was this from?");
        }

        var transaction = await transactionService.SaveExpenseAsync(
            new SaveExpenseCommand(
                userContext,
                draft,
                request.HouseholdId),
            cancellationToken);

        draftStore.Clear(request);
        return ExpenseInputProcessResult.Saved(
            draft,
            transaction,
            BuildSavedExpenseMessage(transaction));
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
        var confidence = CalculateMergedConfidence(
            pendingDraft,
            currentDraft,
            amount,
            categoryGuess,
            merchantName,
            description);

        return new ExpenseDraft(
            amount,
            categoryGuess,
            merchantName,
            description,
            transactionDate,
            CombineSourceText(pendingDraft.SourceText, currentDraft.SourceText),
            currentDraft.InputMode,
            confidence,
            GetMissingFields(amount, categoryGuess, merchantName, description, transactionDate));
    }

    private static bool ShouldMergeParsedResponse(ExpenseDraft pendingDraft, ExpenseDraft currentDraft)
    {
        if (pendingDraft.Amount is not null || currentDraft.Amount is null)
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(currentDraft.Description)
            && !string.IsNullOrWhiteSpace(pendingDraft.Description))
        {
            return true;
        }

        return TextMatches(currentDraft.Description, pendingDraft.Description)
            || TextMatches(currentDraft.MerchantName, pendingDraft.MerchantName);
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
            return ExpenseInputParseResult.Unsupported(
                "I could not identify an expense amount or expense details in that input.");
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

    private static bool TextMatches(string? currentValue, string? pendingValue) =>
        !string.IsNullOrWhiteSpace(currentValue)
        && !string.IsNullOrWhiteSpace(pendingValue)
        && string.Equals(
            currentValue.Trim(),
            pendingValue.Trim(),
            StringComparison.OrdinalIgnoreCase);

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
        DateOnly? transactionDate)
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

        return missingFields;
    }

    private static string BuildSavedExpenseMessage(TransactionModel transaction)
    {
        var amount = FormatAmount(transaction.Amount, transaction.CurrencyCode);
        var description = string.IsNullOrWhiteSpace(transaction.Description)
            ? "this expense"
            : transaction.Description;
        var merchant = string.IsNullOrWhiteSpace(transaction.MerchantName)
            ? string.Empty
            : $" from {transaction.MerchantName}";
        var category = string.IsNullOrWhiteSpace(transaction.CategoryName)
            ? "Uncategorized"
            : transaction.CategoryName;

        return $"Tracked {amount} for {description}{merchant} under {category}.";
    }

    private static string FormatAmount(decimal amount, string currencyCode)
    {
        var formattedAmount = amount.ToString("0.##", CultureInfo.InvariantCulture);
        return string.Equals(currencyCode, "INR", StringComparison.OrdinalIgnoreCase)
            ? $"₹{formattedAmount}"
            : $"{currencyCode.ToUpperInvariant()} {formattedAmount}";
    }
}
