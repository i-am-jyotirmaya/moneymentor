using System.Globalization;

namespace MoneyMentor.Application.InputParsing;

internal static class ExpenseInputAssistantMessages
{
    private static readonly CultureInfo InvariantCulture = CultureInfo.InvariantCulture;

    public static string BuildParsedExpenseMessage(ExpenseDraft draft)
    {
        var amount = draft.Amount?.ToString("0.##", InvariantCulture) ?? "the expense";
        var category = string.IsNullOrWhiteSpace(draft.CategoryGuess)
            ? "an uncategorized expense"
            : draft.CategoryGuess;
        var merchant = string.IsNullOrWhiteSpace(draft.MerchantName)
            ? string.Empty
            : $" from {draft.MerchantName}";
        var description = string.IsNullOrWhiteSpace(draft.Description)
            ? string.Empty
            : $" for {draft.Description}";

        return $"I parsed INR {amount}{description}{merchant} under {category}. This is only a draft for now, not saved yet.";
    }

    public static string BuildMissingAmountMessage(ExpenseDraft draft)
    {
        var subject = draft.Description
            ?? draft.CategoryGuess
            ?? draft.MerchantName
            ?? "this expense";

        return $"How much did you spend on {subject}?";
    }
}
