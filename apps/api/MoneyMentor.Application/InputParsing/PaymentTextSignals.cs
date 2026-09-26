using System.Text.RegularExpressions;

namespace MoneyMentor.Application.InputParsing;

public enum PaymentState { Unknown, Success, Failed, Pending }

public static class PaymentTextSignals
{
    private static bool Has(string text, string pattern) => Regex.IsMatch(text, pattern,
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static PaymentState GetState(string text)
    {
        // Negative evidence always wins, including contradictory OCR lines.
        if (Has(text, @"\b(?:(?:payment|transaction|transfer)\s+(?:has\s+)?failed|failed\s+(?:payment|transaction)|declined|unsuccessful|not\s+successful)\b")) return PaymentState.Failed;
        if (Has(text, @"\b(?:(?:payment|transaction|transfer)\s+(?:(?:is|in)\s+)?(?:pending|processing|progress)|pending\s+(?:payment|transaction)|awaiting\s+confirmation)\b")) return PaymentState.Pending;
        if (Has(text, @"\b(?:(?:payment|transaction|transfer)\s+(?:was\s+)?(?:successful|completed)|paid\s+successfully|debited|you\s+paid)\b")) return PaymentState.Success;
        return PaymentState.Unknown;
    }

    public static bool IsPayment(string text) => GetState(text) != PaymentState.Unknown
        || Has(text, @"\b(?:paid\s+to|payment|transaction\s+(?:id|amount))\b");

    public static bool IsOutgoing(string text) => Has(text, @"\b(?:paid\s+to|you\s+paid|debited|sent\s+to)\b");
    public static bool IsBlocked(string text) => GetState(text) is PaymentState.Failed or PaymentState.Pending;
}
