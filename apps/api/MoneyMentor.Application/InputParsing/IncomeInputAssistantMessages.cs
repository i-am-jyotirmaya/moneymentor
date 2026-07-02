using System.Globalization;

namespace MoneyMentor.Application.InputParsing;

internal static class IncomeInputAssistantMessages
{
    public static string BuildParsedMessage(IncomeDraft draft)
    {
        var amount = draft.Amount?.ToString("0.##", CultureInfo.InvariantCulture) ?? "the income";
        var sender = string.IsNullOrWhiteSpace(draft.SenderName)
            ? string.Empty
            : $" from {draft.SenderName}";
        var reason = string.IsNullOrWhiteSpace(draft.Reason)
            ? string.Empty
            : $" for {draft.Reason}";

        return $"I parsed INR {amount}{sender}{reason}.";
    }

    public static string BuildMissingAmountMessage(IncomeDraft draft)
    {
        if (!string.IsNullOrWhiteSpace(draft.SenderName)
            && !string.IsNullOrWhiteSpace(draft.Reason))
        {
            return $"How much did you receive from {draft.SenderName} for {draft.Reason}?";
        }

        if (!string.IsNullOrWhiteSpace(draft.SenderName))
        {
            return $"How much did you receive from {draft.SenderName}?";
        }

        if (!string.IsNullOrWhiteSpace(draft.Reason))
        {
            return $"How much did you receive for {draft.Reason}?";
        }

        return "How much income did you receive?";
    }
}
