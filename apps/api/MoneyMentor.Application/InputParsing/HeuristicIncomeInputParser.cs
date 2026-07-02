using System.Globalization;
using System.Text.RegularExpressions;

namespace MoneyMentor.Application.InputParsing;

public sealed class HeuristicIncomeInputParser : IIncomeInputParser
{
    private static readonly Regex AmountRegex = new(
        @"(?<![\p{L}\p{N}])(?:(?<prefix>\u20b9|rs\.?|inr|rupees?|rupaye)\s*)?(?<number>\d+(?:[,\s]\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s*(?<unit>k|thousand|thousands|lakh|lakhs|lac|lacs|crore|crores|cr))?(?:\s*(?<suffix>\u20b9|rs\.?|inr|rupees?|rupaye|bucks))?(?![\p{L}\p{N}])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex SenderBeforeVerbRegex = new(
        @"^\s*(?<sender>[\p{L}][\p{L} .'-]{0,79}?)\s+(?:sent|gave|paid|transferred)\s+(?:me|mujhe)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex SenderAfterFromRegex = new(
        @"\bfrom\s+(?<sender>[\p{L}][\p{L} .'-]{0,79}?)(?=\s+(?:for|as|on)\b|[,.!?]|$)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex HindiSenderBeforeVerbRegex = new(
        @"^\s*(?<sender>[\p{L}][\p{L} .'-]{0,79}?)\s+ne\s+mujhe\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex HindiSenderAfterMeRegex = new(
        @"\bmujhe\s+(?<sender>[\p{L}][\p{L} .'-]{0,79}?)\s+se\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex EnglishReasonRegex = new(
        @"\b(?:for|as)\s+(?<reason>[\p{L}\p{N}][\p{L}\p{N} &'./-]{0,119}?)[.!?]*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex HindiReasonRegex = new(
        @"(?<reason>[\p{L}][\p{L}\p{N} &'./-]{0,119}?)\s+ke\s+liye\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public Task<IncomeInputParseResult> ParseAsync(
        IncomeInputParseRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var sourceText = request.SourceText.Trim();
        if (sourceText.Length == 0)
        {
            return Task.FromResult(IncomeInputParseResult.Failed(["Income input text is required."]));
        }

        var terms = ExpenseInputTextNormalizer.CreateTermSet(sourceText);
        if (ExpenseInputKeywordSets.ExpensePaymentSignals.Any(terms.Contains))
        {
            return Task.FromResult(IncomeInputParseResult.Unsupported(
                "This looks like a bill payment or expense rather than income."));
        }

        var amount = ExtractAmount(sourceText);
        var senderName = ExtractSender(sourceText);
        var reason = ExtractReason(sourceText, terms, senderName);
        var hasIncomeSignal = IncomeInputKeywordSets.IncomeSignals.Any(terms.Contains)
            || senderName is not null;
        var missingFields = GetMissingFields(amount, senderName, reason, request.TransactionDate);
        var confidence = CalculateConfidence(
            amount,
            senderName,
            reason,
            request.TransactionDate,
            hasIncomeSignal);

        var draft = new IncomeDraft(
            amount,
            senderName,
            reason,
            request.TransactionDate,
            sourceText,
            request.InputMode,
            confidence,
            missingFields);

        if (amount is null && (hasIncomeSignal || reason is not null))
        {
            return Task.FromResult(IncomeInputParseResult.NeedsClarification(
                draft,
                IncomeInputAssistantMessages.BuildMissingAmountMessage(draft)));
        }

        if (amount is not null && !hasIncomeSignal && reason is null)
        {
            return Task.FromResult(IncomeInputParseResult.NeedsClarification(
                draft,
                "Who sent this income, or what was it for?"));
        }

        if (amount is null)
        {
            return Task.FromResult(IncomeInputParseResult.Unsupported(
                "I could not identify income details in that input."));
        }

        return Task.FromResult(IncomeInputParseResult.Parsed(
            draft,
            IncomeInputAssistantMessages.BuildParsedMessage(draft)));
    }

    private static decimal? ExtractAmount(string sourceText)
    {
        foreach (Match match in AmountRegex.Matches(sourceText))
        {
            var numericText = match.Groups["number"].Value.Replace(",", string.Empty, StringComparison.Ordinal)
                .Replace(" ", string.Empty, StringComparison.Ordinal);
            if (!decimal.TryParse(
                    numericText,
                    NumberStyles.AllowDecimalPoint,
                    CultureInfo.InvariantCulture,
                    out var value))
            {
                continue;
            }

            var multiplier = match.Groups["unit"].Value.ToLowerInvariant() switch
            {
                "k" or "thousand" or "thousands" => 1_000m,
                "lakh" or "lakhs" or "lac" or "lacs" => 100_000m,
                "crore" or "crores" or "cr" => 10_000_000m,
                _ => 1m
            };
            var amount = value * multiplier;
            if (amount > 0m)
            {
                return amount;
            }
        }

        return null;
    }

    private static string? ExtractSender(string sourceText)
    {
        foreach (var regex in new[]
                 {
                     SenderBeforeVerbRegex,
                     HindiSenderBeforeVerbRegex,
                     SenderAfterFromRegex,
                     HindiSenderAfterMeRegex
                 })
        {
            var match = regex.Match(sourceText);
            if (match.Success)
            {
                return ToDisplayText(match.Groups["sender"].Value);
            }
        }

        return null;
    }

    private static string? ExtractReason(
        string sourceText,
        IReadOnlySet<string> terms,
        string? senderName)
    {
        var englishMatch = EnglishReasonRegex.Match(sourceText);
        if (englishMatch.Success)
        {
            return CleanReason(englishMatch.Groups["reason"].Value);
        }

        var hindiMatch = HindiReasonRegex.Match(sourceText);
        if (hindiMatch.Success)
        {
            var reason = AmountRegex.Replace(hindiMatch.Groups["reason"].Value, " ");
            if (!string.IsNullOrWhiteSpace(senderName))
            {
                reason = Regex.Replace(
                    reason,
                    $@"^\s*{Regex.Escape(senderName)}\s+",
                    " ",
                    RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            }

            reason = Regex.Replace(
                reason,
                @"(?<![\p{L}\p{N}])(?:ne|mujhe|diye|mila|mili|mile)(?![\p{L}\p{N}])",
                " ",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            return CleanReason(reason);
        }

        if (IncomeInputKeywordSets.SalarySignals.Any(terms.Contains))
        {
            return "Salary";
        }

        if (IncomeInputKeywordSets.BonusSignals.Any(terms.Contains))
        {
            return "Bonus";
        }

        if (IncomeInputKeywordSets.FreelanceSignals.Any(terms.Contains))
        {
            return "Freelance work";
        }

        if (IncomeInputKeywordSets.RefundSignals.Any(terms.Contains))
        {
            return "Refund";
        }

        return IncomeInputKeywordSets.GiftSignals.Any(terms.Contains) ? "Gift" : null;
    }

    private static string? CleanReason(string value)
    {
        var normalized = Regex.Replace(value, @"\s+", " ").Trim(' ', ',', '.', ';', ':', '!', '?');
        return normalized.Length == 0 ? null : normalized;
    }

    private static string? ToDisplayText(string value)
    {
        var normalized = Regex.Replace(value, @"\s+", " ").Trim(' ', ',', '.', ';', ':', '!', '?');
        if (normalized.Length == 0)
        {
            return null;
        }

        return string.Join(
            ' ',
            normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(word => char.ToUpperInvariant(word[0]) + word[1..].ToLowerInvariant()));
    }

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

    private static decimal CalculateConfidence(
        decimal? amount,
        string? senderName,
        string? reason,
        DateOnly? transactionDate,
        bool hasIncomeSignal)
    {
        var confidence = 0.05m;
        confidence += hasIncomeSignal ? 0.20m : 0m;
        confidence += amount is null ? 0m : 0.40m;
        confidence += senderName is null ? 0m : 0.15m;
        confidence += reason is null ? 0m : 0.15m;
        confidence += transactionDate is null ? 0m : 0.05m;

        return decimal.Round(Math.Clamp(confidence, 0m, 0.98m), 4);
    }
}
