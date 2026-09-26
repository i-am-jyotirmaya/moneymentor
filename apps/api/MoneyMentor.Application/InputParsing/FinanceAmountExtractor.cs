using System.Globalization;
using System.Text.RegularExpressions;

namespace MoneyMentor.Application.InputParsing;

// Shared by text, speech and image input, and by expense and income parsers.
public static class FinanceAmountExtractor
{
    public static readonly Regex AmountPattern = new(
        @"(?<![\p{L}\p{N}])(?:(?<prefix>₹|rs\.?|inr|rupees?|rupaye)[ \t]*)?(?<number>\d+(?:[, \t]\d{2,3})*(?:\.\d{1,2})?)(?:[ \t]*(?<unit>k|thousands?|lakhs?|lacs?|crores?|cr))?(?:[ \t]*(?<suffix>₹|rs\.?|inr|rupees?|rupaye|bucks))?(?![\p{L}\p{N}])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex NonAmount = new(
        @"\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}\s+(?:Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+\d{4})\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public sealed record Candidate(decimal Amount, int Start, int Length, int Score);

    public static Candidate? Extract(string text)
    {
        var excluded = NonAmount.Matches(text).Cast<Match>().ToArray();
        var candidates = new List<Candidate>();
        foreach (Match match in AmountPattern.Matches(text))
        {
            if (excluded.Any(x => x.Index < match.Index + match.Length && match.Index < x.Index + x.Length)) continue;
            var number = Regex.Replace(match.Groups["number"].Value, @"[,\s]", "");
            if (!decimal.TryParse(number, NumberStyles.Number, CultureInfo.InvariantCulture, out var value) || value <= 0 || value > 100_000_000m) continue;
            var lineStart = text.LastIndexOf('\n', Math.Max(0, match.Index - 1)) + 1;
            var lineEnd = text.IndexOf('\n', match.Index + match.Length);
            if (lineEnd < 0) lineEnd = text.Length;
            var context = text[lineStart..lineEnd];
            // Labels on a separate OCR line belong to the following amount.
            if (!Regex.IsMatch(text[lineStart..match.Index], @"[\p{L}]") && lineStart > 0)
            {
                var previousStart = text.LastIndexOf('\n', Math.Max(0, lineStart - 2)) + 1;
                var previous = text[previousStart..(lineStart - 1)];
                if (!previous.Any(char.IsDigit)) context = previous + " " + context;
            }
            if (Regex.IsMatch(context, @"\b(balance|available|cashback|reward\w*|saved|limit|reference|ref|utr|upi\s+(?:transaction\s+)?id|transaction\s+id|account\s+(?:number|no)|card\s+(?:number|no))\b", RegexOptions.IgnoreCase)) continue;
            var multiplier = match.Groups["unit"].Value.ToLowerInvariant() switch
            {
                "k" or "thousand" or "thousands" => 1_000m,
                "lakh" or "lakhs" or "lac" or "lacs" => 100_000m,
                "crore" or "crores" or "cr" => 10_000_000m,
                _ => 1m
            };
            value *= multiplier;
            if (value > 100_000_000m) continue;
            var score = (match.Groups["prefix"].Success || match.Groups["suffix"].Success ? 5 : 0)
                + (match.Groups["unit"].Success ? 4 : 0)
                + (Regex.IsMatch(context, @"\b(paid|amount|debited|sent|transaction|total|spent|received|salary)\b", RegexOptions.IgnoreCase) ? 4 : 0);
            candidates.Add(new Candidate(decimal.Round(value, 2), match.Index, match.Length, score));
        }
        var best = candidates.OrderByDescending(x => x.Score).FirstOrDefault();
        return best is null || candidates.Any(x => x.Score == best.Score && x.Amount != best.Amount) ? null : best;
    }
}
