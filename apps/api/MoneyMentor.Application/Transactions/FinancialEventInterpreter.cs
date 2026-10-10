using System.Text.RegularExpressions;
using MoneyMentor.Domain.Enums;
namespace MoneyMentor.Application.Transactions;

// Interprets normalized text only; capture/transcription providers have no accounting rules.
public static class FinancialEventInterpreter
{
    public static TransactionKind? DetectKind(string text)
    {
        if (Regex.IsMatch(text, @"^\s*(how|what|where|when|why|show|list|can|did|have)\b", RegexOptions.IgnoreCase)) return null;
        if (Has(text, @"\bearned\s+income\b")) return TransactionKind.Income;
        if (Has(text, @"\b(refund(?:ed)?|money\s+back)\b")) return TransactionKind.Refund;
        if (Has(text, @"\b(reversal|reversed|reverse(?:d)?\s+(?:the|my|this)?\s*transaction)\b")) return TransactionKind.Reversal;
        if (Has(text, @"\b(cash\s?back|reward(?:s)?)\b")) return TransactionKind.Cashback;
        if (Has(text, @"\b(?:credit[ -]?card|card)\s+(?:bill|payment)\b|\bbill\s+(?:of|for)\s+(?:my\s+)?(?:credit[ -]?card|card)\b")) return TransactionKind.CreditCardPayment;
        if (Has(text, @"\b(annual|late[ -]?payment|foreign[ -]?transaction|card)\s+fee\b|\bfee\s+(?:of|charged)\b")) return TransactionKind.Fee;
        if (Has(text, @"\b(finance\s+charge|(?:card|charged|paid)\s+interest|interest\s+(?:charged|on\s+(?:my\s+)?(?:card|credit)))\b")) return TransactionKind.Interest;
        if (Has(text, @"\b(withdraw(?:n|al)?|withdrew|atm\s+withdrawal)\b")) return TransactionKind.CashWithdrawal;
        if (Has(text, @"\b(transfer(?:red)?|moved)\b") && Has(text, @"\b(from|between|to)\b")) return TransactionKind.Transfer;
        return null;
    }

    public static bool IsAmbiguousCredit(string text) => DetectKind(text) is null
        && Has(text, @"\b(sent\s+me|credited|received\s+from|reimbursement|reimbursed)\b")
        && !Has(text, @"\b(salary|wage|bonus|freelance|interest\s+earned)\b")
        && !Has(text, @"^\s*(how|what|where|when|why|show|list)\b");

    public static TransactionIntent AddMetadata(TransactionIntent intent, string text)
    {
        var transfer = intent.EventKind is TransactionKind.Transfer or TransactionKind.CreditCardPayment or TransactionKind.CashWithdrawal;
        var purchaseAccount = Regex.Match(text, @"\b(?:using\s+(?:my\s+)?|on\s+my\s+|with\s+my\s+)(?<value>.+?)(?=\s+(?:for|at|today|yesterday)\b|[.,]|$)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        var account = transfer ? Capture(text, @"\bfrom\s+(?<value>.+?)(?=\s+to\b|[.,]|$)")
            : purchaseAccount.Success ? purchaseAccount.Groups["value"].Value.Trim() : null;
        var to = transfer ? Capture(text, @"\bto\s+(?:my\s+)?(?<value>.+?)(?=\s+(?:from|today|yesterday)\b|[.,]|$)") : null;
        if (intent.EventKind == TransactionKind.CreditCardPayment)
            to ??= Capture(text, @"\b(?:paid|pay)\s+(?:my\s+)?(?<value>.+?)\s+bill\b");
        static string? Clean(string? value) => value is null ? null : Regex.Replace(value,
            @"\s+(?:credit[ -]?card|card)$|\b(?:upi|cash|bank\s+transfer|auto\s?debit)\b", "", RegexOptions.IgnoreCase).Trim();
        account = Clean(account); to = Clean(to);
        var channel = Has(text, @"\bupi\b") ? PaymentChannel.UPI
            : Has(text, @"\bauto\s?debit\b") ? PaymentChannel.AutoDebit
            : Has(text, @"\bcash\b") ? PaymentChannel.Cash
            : Has(text, @"\bcard\b") ? PaymentChannel.Card
            : Has(text, @"\bbank\s+transfer\b") ? PaymentChannel.BankTransfer : (PaymentChannel?)null;
        var description = intent.Description;
        if (!transfer && purchaseAccount.Success && description is not null)
        {
            // Capture parsers can retain the payment clause, or only its account text
            // after removing connector words. Neither is the purchase purpose.
            var paymentPhrase = $@"(?<![\p{{L}}\p{{N}}])(?:{Regex.Escape(purchaseAccount.Value.Trim())}|{Regex.Escape(purchaseAccount.Groups["value"].Value.Trim())})(?![\p{{L}}\p{{N}}])";
            description = Regex.Replace(description, paymentPhrase, "", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            description = Regex.Replace(description, @"\s+", " ").Trim(' ', ',', '.', ';', ':');
            if (description.Length == 0) description = null;
        }
        return intent with { AccountAlias = string.IsNullOrWhiteSpace(account) ? null : account,
            CounterpartyAccountAlias = string.IsNullOrWhiteSpace(to) ? null : to, PaymentChannel = intent.PaymentChannel ?? channel,
            Description = description };
    }
    public static string? RefundMerchant(string text) =>
        Capture(text, @"^\s*(?<value>[\p{L}][\p{L} '.&-]{1,60}?)\s+(?:refunded|reversed)\b")
        ?? Capture(text, @"\b(?:refund(?:ed)?|cashback).*?\bfrom\s+(?<value>[\p{L}][\p{L} '.&-]{1,60}?)(?=\s+(?:for|on|to|of)\b|\s+\d|$)");
    private static string? Capture(string text, string pattern)
    {
        var match = Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return match.Success ? match.Groups["value"].Value.Trim() : null;
    }
    private static bool Has(string text, string pattern) => Regex.IsMatch(text, pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
}
