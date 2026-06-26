using System.Globalization;
using System.Text.RegularExpressions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.InputParsing;

public sealed class HeuristicExpenseInputParser : IExpenseInputParser
{
    private static readonly CultureInfo InvariantCulture = CultureInfo.InvariantCulture;

    private static readonly Regex AmountRegex = new(
        @"(?<![\p{L}\p{N}])(?:(?<prefix>\u20b9|rs\.?|inr|rupees?|rupaye)\s*)?(?<number>\d+(?:[,\s]\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s*(?<unit>k|thousand|thousands|lakh|lakhs|lac|lacs|crore|crores|cr))?(?:\s*(?<suffix>\u20b9|rs\.?|inr|rupees?|rupaye|bucks))?(?![\p{L}\p{N}])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex IsoDateRegex = new(
        @"(?<!\d)(?<year>\d{4})-(?<month>\d{1,2})-(?<day>\d{1,2})(?!\d)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex SlashOrDashDateRegex = new(
        @"(?<!\d)(?<day>\d{1,2})[/-](?<month>\d{1,2})(?:[/-](?<year>\d{2,4}))?(?!\d)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex MerchantConnectorRegex = new(
        @"(?<![\p{L}\p{N}])(?:(?:bought|ordered)\s+from|paid\s+to|from|at|via|through|to|se|pe|par)\s+(?<merchant>[\p{L}\p{N}&'.\- ]{2,80})",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex TokenRegex = new(
        @"[\p{L}\p{N}&'.\-]+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex DescriptionCleanupRegex = new(
        @"(?<![\p{L}\p{N}])(?:i|we|my|a|an|the|got|get|grabbed|ordered|order|paid|pay|spend|spent|spending|buy|bought|purchase|purchased|for|on|at|from|via|through|to|rs|inr|rupee|rupees|rupaye|kharch|kharcha|kharche|kiya|kara|diya|liya|liye|mein|me|pe|par|ka|ke|ki|ko)(?![\p{L}\p{N}])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static readonly Regex TrimPunctuationRegex = new(
        @"^[\s,.;:!?@#\-]+|[\s,.;:!?@#\-]+$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public Task<ExpenseInputParseResult> ParseAsync(
        ExpenseInputParseRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var sourceText = request.SourceText.Trim();
        if (sourceText.Length == 0)
        {
            return Task.FromResult(
                ExpenseInputParseResult.Failed(["Expense input text is required."]));
        }

        var searchTerms = ExpenseInputTextNormalizer.CreateTermSet(sourceText);
        if (LooksLikeFinanceQuestion(searchTerms))
        {
            return Task.FromResult(
                ExpenseInputParseResult.Unsupported("This looks like a finance question rather than a new expense."));
        }

        if (LooksLikeIncomeOrGoalInput(searchTerms) && !HasExpenseSignal(searchTerms))
        {
            return Task.FromResult(
                ExpenseInputParseResult.Unsupported("This input does not look like an expense."));
        }

        var date = ExtractDate(sourceText, request.TransactionDate);
        var amount = ExtractAmount(sourceText, date.SourceSpans);
        var category = ExtractCategory(searchTerms);
        var merchant = ExtractMerchant(sourceText, searchTerms);

        if (category is null && merchant?.ImpliedCategory is not null)
        {
            category = new CategoryMatch(merchant.ImpliedCategory, merchant.Name, 55);
        }

        var description = ExtractDescription(
            sourceText,
            amount?.Span,
            merchant?.RemovalSpan,
            date.SourceSpans);

        var missingFields = GetMissingFields(
            amount,
            category,
            merchant,
            description,
            date.Value,
            request.HouseholdId);

        var confidence = CalculateConfidence(
            searchTerms,
            amount,
            category,
            merchant,
            description,
            date.HasMatchedDate,
            missingFields);

        var draft = new ExpenseDraft(
            amount?.Amount,
            category?.Category,
            merchant?.Name,
            description,
            date.Value,
            sourceText,
            request.InputMode,
            confidence,
            missingFields);

        if (amount is null && HasAnyExpenseEvidence(category, merchant, description))
        {
            return Task.FromResult(
                ExpenseInputParseResult.NeedsClarification(
                    draft,
                    ExpenseInputAssistantMessages.BuildMissingAmountMessage(draft)));
        }

        if (amount is not null && !HasAnyExpenseEvidence(category, merchant, description))
        {
            return Task.FromResult(
                ExpenseInputParseResult.NeedsClarification(
                    draft,
                    "What was this expense for?"));
        }

        if (amount is null)
        {
            return Task.FromResult(
                ExpenseInputParseResult.Unsupported("I could not identify an expense amount or expense details in that input."));
        }

        return Task.FromResult(
            ExpenseInputParseResult.Parsed(
                draft,
                ExpenseInputAssistantMessages.BuildParsedExpenseMessage(draft)));
    }

    private static bool LooksLikeFinanceQuestion(IReadOnlySet<string> searchTerms) =>
        ContainsAny(searchTerms, ExpenseInputKeywordSets.FinanceQuestionSignals);

    private static bool LooksLikeIncomeOrGoalInput(IReadOnlySet<string> searchTerms) =>
        ContainsAny(searchTerms, ExpenseInputKeywordSets.IncomeSignals)
            || ContainsAny(searchTerms, ExpenseInputKeywordSets.GoalSignals);

    private static bool HasExpenseSignal(IReadOnlySet<string> searchTerms) =>
        ContainsAny(searchTerms, ExpenseInputKeywordSets.ExpenseSignals);

    private static bool ContainsAny(IReadOnlySet<string> searchTerms, IReadOnlySet<string> terms) =>
        terms.Any(searchTerms.Contains);

    private static DateExtraction ExtractDate(string sourceText, DateOnly? requestedDate)
    {
        var spans = new List<TextSpan>();

        foreach (Match match in IsoDateRegex.Matches(sourceText))
        {
            if (TryCreateDate(
                    match.Groups["year"].Value,
                    match.Groups["month"].Value,
                    match.Groups["day"].Value,
                    out var parsedDate))
            {
                spans.Add(new TextSpan(match.Index, match.Length));
                return new DateExtraction(parsedDate, spans, true);
            }
        }

        foreach (Match match in SlashOrDashDateRegex.Matches(sourceText))
        {
            var year = match.Groups["year"].Success
                ? match.Groups["year"].Value
                : DateTimeOffset.Now.Year.ToString(InvariantCulture);

            if (TryCreateDate(year, match.Groups["month"].Value, match.Groups["day"].Value, out var parsedDate))
            {
                spans.Add(new TextSpan(match.Index, match.Length));
                return new DateExtraction(parsedDate, spans, true);
            }
        }

        var relativeDate = ExtractRelativeDate(sourceText);
        if (relativeDate is not null)
        {
            spans.Add(relativeDate.Span);
            return new DateExtraction(relativeDate.Value, spans, true);
        }

        return requestedDate.HasValue
            ? new DateExtraction(requestedDate.Value, spans, true)
            : new DateExtraction(null, spans, false);
    }

    private static RelativeDateMatch? ExtractRelativeDate(string sourceText)
    {
        var searchTerms = ExpenseInputTextNormalizer.CreateTermSet(sourceText);
        var today = DateOnly.FromDateTime(DateTimeOffset.Now.Date);

        if (TryFindTermSpan(sourceText, searchTerms, "today", out var todaySpan)
            || TryFindTermSpan(sourceText, searchTerms, "aaj", out todaySpan))
        {
            return new RelativeDateMatch(today, todaySpan);
        }

        if (TryFindTermSpan(sourceText, searchTerms, "yesterday", out var yesterdaySpan)
            || TryFindTermSpan(sourceText, searchTerms, "last night", out yesterdaySpan))
        {
            return new RelativeDateMatch(today.AddDays(-1), yesterdaySpan);
        }

        return null;
    }

    private static bool TryCreateDate(string yearText, string monthText, string dayText, out DateOnly date)
    {
        date = default;

        if (!int.TryParse(yearText, NumberStyles.None, InvariantCulture, out var year)
            || !int.TryParse(monthText, NumberStyles.None, InvariantCulture, out var month)
            || !int.TryParse(dayText, NumberStyles.None, InvariantCulture, out var day))
        {
            return false;
        }

        if (year < 100)
        {
            year += year >= 70 ? 1900 : 2000;
        }

        try
        {
            date = new DateOnly(year, month, day);
            return true;
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }
    }

    private static AmountMatch? ExtractAmount(string sourceText, IReadOnlyCollection<TextSpan> dateSpans)
    {
        var matches = AmountRegex.Matches(sourceText);
        AmountMatch? bestMatch = null;

        for (var index = 0; index < matches.Count; index++)
        {
            var match = matches[index];
            var span = new TextSpan(match.Index, match.Length);

            if (dateSpans.Any(dateSpan => dateSpan.Overlaps(span))
                || HasDateSeparatorBeside(sourceText, match))
            {
                continue;
            }

            var numberText = match.Groups["number"].Value.Replace(",", string.Empty, StringComparison.Ordinal);
            numberText = ExpenseInputTextNormalizer.RemoveWhitespace(numberText);

            if (!decimal.TryParse(numberText, NumberStyles.Number, InvariantCulture, out var numericValue)
                || numericValue <= 0)
            {
                continue;
            }

            var amount = numericValue * GetAmountMultiplier(match.Groups["unit"].Value);
            if (amount <= 0 || amount > 100_000_000m)
            {
                continue;
            }

            var score = ScoreAmountCandidate(sourceText, match, index == matches.Count - 1);
            if (score == 0 && bestMatch is not null)
            {
                continue;
            }

            var candidate = new AmountMatch(decimal.Round(amount, 2), span, score);
            if (bestMatch is null
                || candidate.Score > bestMatch.Score
                || (candidate.Score == bestMatch.Score && candidate.Span.Start > bestMatch.Span.Start))
            {
                bestMatch = candidate;
            }
        }

        return bestMatch;
    }

    private static bool HasDateSeparatorBeside(string sourceText, Match match)
    {
        var beforeIndex = match.Index - 1;
        var afterIndex = match.Index + match.Length;

        return beforeIndex >= 0 && (sourceText[beforeIndex] == '/' || sourceText[beforeIndex] == '-')
            || afterIndex < sourceText.Length && (sourceText[afterIndex] == '/' || sourceText[afterIndex] == '-');
    }

    private static decimal GetAmountMultiplier(string unit)
    {
        return unit.ToLowerInvariant() switch
        {
            "k" or "thousand" or "thousands" => 1_000m,
            "lakh" or "lakhs" or "lac" or "lacs" => 100_000m,
            "crore" or "crores" or "cr" => 10_000_000m,
            _ => 1m
        };
    }

    private static int ScoreAmountCandidate(string sourceText, Match match, bool isLastNumericMatch)
    {
        var score = 0;

        if (match.Groups["prefix"].Success || match.Groups["suffix"].Success)
        {
            score += 5;
        }

        if (match.Groups["unit"].Success)
        {
            score += 4;
        }

        var start = Math.Max(0, match.Index - 36);
        var length = Math.Min(sourceText.Length - start, match.Length + 72);
        var contextTerms = ExpenseInputTextNormalizer.CreateTermSet(sourceText.Substring(start, length));

        if (ContainsAny(contextTerms, ExpenseInputKeywordSets.AmountContextWords))
        {
            score += 3;
        }

        if (ContainsAny(contextTerms, ExpenseInputKeywordSets.ExpenseSignals))
        {
            score += 2;
        }

        if (isLastNumericMatch)
        {
            score += 1;
        }

        return score;
    }

    private static CategoryMatch? ExtractCategory(IReadOnlySet<string> searchTerms)
    {
        CategoryMatch? bestMatch = null;

        foreach (var rule in ExpenseCategoryKeywordCatalog.Rules)
        {
            foreach (var keyword in rule.Keywords)
            {
                if (!searchTerms.Contains(keyword))
                {
                    continue;
                }

                var score = rule.Priority + keyword.Length + ExpenseInputTextNormalizer.CountWords(keyword) * 10;
                var candidate = new CategoryMatch(rule.Category, keyword, score);
                if (bestMatch is null || candidate.Score > bestMatch.Score)
                {
                    bestMatch = candidate;
                }
            }
        }

        return bestMatch;
    }

    private static MerchantMatch? ExtractMerchant(string sourceText, IReadOnlySet<string> searchTerms)
    {
        var knownMerchant = ExtractKnownMerchant(sourceText, searchTerms);
        var connectorMerchant = ExtractConnectorMerchant(sourceText);

        if (knownMerchant is null)
        {
            return connectorMerchant;
        }

        if (connectorMerchant is null)
        {
            return knownMerchant;
        }

        return connectorMerchant.Score >= knownMerchant.Score
            ? connectorMerchant
            : knownMerchant;
    }

    private static MerchantMatch? ExtractKnownMerchant(string sourceText, IReadOnlySet<string> searchTerms)
    {
        MerchantMatch? bestMatch = null;

        foreach (var rule in ExpenseMerchantKeywordCatalog.Rules)
        {
            foreach (var keyword in rule.Keywords)
            {
                if (!searchTerms.Contains(keyword))
                {
                    continue;
                }

                var removalSpan = FindOriginalTermSpan(sourceText, keyword);
                var score = 70 + keyword.Length + ExpenseInputTextNormalizer.CountWords(keyword) * 8;
                var candidate = new MerchantMatch(rule.DisplayName, rule.ImpliedCategory, removalSpan, score);

                if (bestMatch is null || candidate.Score > bestMatch.Score)
                {
                    bestMatch = candidate;
                }
            }
        }

        return bestMatch;
    }

    private static MerchantMatch? ExtractConnectorMerchant(string sourceText)
    {
        MerchantMatch? bestMatch = null;

        foreach (Match match in MerchantConnectorRegex.Matches(sourceText))
        {
            var merchantGroup = match.Groups["merchant"];
            var knownMerchant = FindKnownMerchantInPhrase(merchantGroup.Value);
            if (knownMerchant is not null)
            {
                var knownRemovalLength = merchantGroup.Index
                    + knownMerchant.RelativeStart
                    + knownMerchant.Length
                    - match.Index;

                var knownCandidate = new MerchantMatch(
                    knownMerchant.Rule.DisplayName,
                    knownMerchant.Rule.ImpliedCategory,
                    new TextSpan(match.Index, knownRemovalLength),
                    110 + knownMerchant.Length);

                if (bestMatch is null || knownCandidate.Score > bestMatch.Score)
                {
                    bestMatch = knownCandidate;
                }

                continue;
            }

            var merchantName = CleanMerchantCandidate(merchantGroup.Value);
            if (merchantName is null)
            {
                continue;
            }

            var removalLength = merchantGroup.Index + merchantGroup.Length - match.Index;
            var removalSpan = new TextSpan(match.Index, removalLength);
            var candidate = new MerchantMatch(
                merchantName,
                null,
                removalSpan,
                85 + ExpenseInputTextNormalizer.CountWords(merchantName) * 6);

            if (bestMatch is null || candidate.Score > bestMatch.Score)
            {
                bestMatch = candidate;
            }
        }

        return bestMatch;
    }

    private static KnownMerchantPhraseMatch? FindKnownMerchantInPhrase(string phrase)
    {
        KnownMerchantPhraseMatch? bestMatch = null;

        foreach (var rule in ExpenseMerchantKeywordCatalog.Rules)
        {
            foreach (var keyword in rule.Keywords)
            {
                var span = FindOriginalTermSpan(phrase, keyword);
                if (span is null)
                {
                    continue;
                }

                var candidate = new KnownMerchantPhraseMatch(rule, span.Value.Start, span.Value.Length);
                if (bestMatch is null
                    || candidate.Length > bestMatch.Length
                    || (candidate.Length == bestMatch.Length && candidate.RelativeStart < bestMatch.RelativeStart))
                {
                    bestMatch = candidate;
                }
            }
        }

        return bestMatch;
    }

    private static string? CleanMerchantCandidate(string value)
    {
        var withoutAmount = AmountRegex.Replace(value, " ");
        var words = TokenRegex.Matches(withoutAmount)
            .Select(match => match.Value.Trim('\'', '.', '-'))
            .Where(word => word.Length > 0)
            .TakeWhile(word => !ExpenseInputKeywordSets.MerchantStopWords.Contains(
                ExpenseInputTextNormalizer.NormalizeKeyword(word)))
            .Take(5)
            .ToArray();

        if (words.Length == 0)
        {
            return null;
        }

        var candidate = string.Join(' ', words);
        if (candidate.Length < 2)
        {
            return null;
        }

        return ToDisplayName(candidate);
    }

    private static string? ExtractDescription(
        string sourceText,
        TextSpan? amountSpan,
        TextSpan? merchantSpan,
        IReadOnlyCollection<TextSpan> dateSpans)
    {
        var spans = new List<TextSpan>();

        if (amountSpan is not null)
        {
            spans.Add(amountSpan.Value);
        }

        if (merchantSpan is not null)
        {
            spans.Add(merchantSpan.Value);
        }

        spans.AddRange(dateSpans);

        var description = RemoveSpans(sourceText, spans);
        description = DescriptionCleanupRegex.Replace(description, " ");
        description = ExpenseInputTextNormalizer.ReplaceNonSearchCharacters(description, " ");
        description = ExpenseInputTextNormalizer.CollapseWhitespace(description).Trim();

        description = TrimPunctuationRegex.Replace(description, string.Empty).Trim();
        return description.Length >= 2 ? description : null;
    }

    private static string RemoveSpans(string value, IEnumerable<TextSpan> spans)
    {
        var result = value;
        foreach (var span in spans.OrderByDescending(span => span.Start))
        {
            if (span.Start < 0 || span.Start >= result.Length)
            {
                continue;
            }

            var length = Math.Min(span.Length, result.Length - span.Start);
            result = result.Remove(span.Start, length).Insert(span.Start, " ");
        }

        return result;
    }

    private static IReadOnlyCollection<ExpenseDraftMissingField> GetMissingFields(
        AmountMatch? amount,
        CategoryMatch? category,
        MerchantMatch? merchant,
        string? description,
        DateOnly? transactionDate,
        Guid? householdId)
    {
        var missingFields = new List<ExpenseDraftMissingField>();

        if (amount is null)
        {
            missingFields.Add(ExpenseDraftMissingField.Amount);
        }

        if (category is null)
        {
            missingFields.Add(ExpenseDraftMissingField.Category);
        }

        if (merchant is null)
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

    private static decimal CalculateConfidence(
        IReadOnlySet<string> searchTerms,
        AmountMatch? amount,
        CategoryMatch? category,
        MerchantMatch? merchant,
        string? description,
        bool hasMatchedDate,
        IReadOnlyCollection<ExpenseDraftMissingField> missingFields)
    {
        var confidence = 0m;

        if (amount is not null)
        {
            confidence += Math.Min(0.48m, 0.34m + amount.Score * 0.025m);
        }

        if (category is not null)
        {
            confidence += Math.Min(0.18m, 0.10m + category.Score * 0.0008m);
        }

        if (merchant is not null)
        {
            confidence += Math.Min(0.14m, 0.08m + merchant.Score * 0.0005m);
        }

        if (!string.IsNullOrWhiteSpace(description))
        {
            confidence += 0.10m;
        }

        if (hasMatchedDate)
        {
            confidence += 0.05m;
        }

        if (HasExpenseSignal(searchTerms))
        {
            confidence += 0.08m;
        }

        if (missingFields.Contains(ExpenseDraftMissingField.Amount))
        {
            confidence -= 0.16m;
        }

        if (missingFields.Contains(ExpenseDraftMissingField.Description)
            && missingFields.Contains(ExpenseDraftMissingField.Category))
        {
            confidence -= 0.08m;
        }

        return decimal.Round(Math.Clamp(confidence, 0m, 0.98m), 4);
    }

    private static bool HasAnyExpenseEvidence(
        CategoryMatch? category,
        MerchantMatch? merchant,
        string? description) =>
        category is not null || merchant is not null || !string.IsNullOrWhiteSpace(description);

    private static bool TryFindTermSpan(
        string sourceText,
        IReadOnlySet<string> searchTerms,
        string term,
        out TextSpan span)
    {
        span = default;
        var normalizedTerm = ExpenseInputTextNormalizer.NormalizeKeyword(term);
        if (!searchTerms.Contains(normalizedTerm))
        {
            return false;
        }

        span = FindOriginalTermSpan(sourceText, term) ?? default;
        return span.Length > 0;
    }

    private static TextSpan? FindOriginalTermSpan(string sourceText, string term)
    {
        var normalizedTerm = ExpenseInputTextNormalizer.NormalizeKeyword(term);
        if (normalizedTerm.Length == 0)
        {
            return null;
        }

        var tokens = normalizedTerm
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(Regex.Escape);

        var pattern = $@"(?<![\p{{L}}\p{{N}}]){string.Join(@"[^\p{L}\p{N}]+", tokens)}(?![\p{{L}}\p{{N}}])";
        var match = Regex.Match(
            sourceText,
            pattern,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        return match.Success
            ? new TextSpan(match.Index, match.Length)
            : null;
    }

    private static string ToDisplayName(string value) =>
        InvariantCulture.TextInfo.ToTitleCase(value.ToLowerInvariant());

    private sealed record KnownMerchantPhraseMatch(ExpenseMerchantKeywordRule Rule, int RelativeStart, int Length);

    private sealed record CategoryMatch(string Category, string MatchedKeyword, int Score);

    private sealed record MerchantMatch(string Name, string? ImpliedCategory, TextSpan? RemovalSpan, int Score);

    private sealed record AmountMatch(decimal Amount, TextSpan Span, int Score);

    private sealed record DateExtraction(DateOnly? Value, IReadOnlyCollection<TextSpan> SourceSpans, bool HasMatchedDate);

    private sealed record RelativeDateMatch(DateOnly Value, TextSpan Span);

    private readonly record struct TextSpan(int Start, int Length)
    {
        public bool Overlaps(TextSpan other) =>
            Start < other.Start + other.Length && other.Start < Start + Length;
    }
}
