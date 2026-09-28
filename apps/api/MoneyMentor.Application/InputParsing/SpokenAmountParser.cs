using System.Text.RegularExpressions;

namespace MoneyMentor.Application.InputParsing;

internal static class SpokenAmountParser
{
    private static readonly IReadOnlyDictionary<string, int> Values = new Dictionary<string, int>
    {
        ["one"] = 1, ["two"] = 2, ["three"] = 3, ["four"] = 4, ["five"] = 5,
        ["six"] = 6, ["seven"] = 7, ["eight"] = 8, ["nine"] = 9, ["ten"] = 10,
        ["eleven"] = 11, ["twelve"] = 12, ["thirteen"] = 13, ["fourteen"] = 14,
        ["fifteen"] = 15, ["sixteen"] = 16, ["seventeen"] = 17, ["eighteen"] = 18,
        ["nineteen"] = 19, ["twenty"] = 20, ["thirty"] = 30, ["forty"] = 40,
        ["fifty"] = 50, ["sixty"] = 60, ["seventy"] = 70, ["eighty"] = 80,
        ["ninety"] = 90
    };

    private const string NumberWord = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lakhs|lac|lacs|crore|crores";
    private static readonly Regex PhraseRegex = new(
        $@"(?<![\p{{L}}\p{{N}}])(?<words>(?:{NumberWord})(?:[\s-]+(?:and[\s-]+)?(?:{NumberWord}))*)(?:\s+(?<currency>rupees?|rupaye|inr|rs))?(?![\p{{L}}\p{{N}}])",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static (decimal Amount, int Start, int Length)? Find(string text)
    {
        foreach (Match match in PhraseRegex.Matches(text))
        {
            var words = Regex.Split(match.Groups["words"].Value.ToLowerInvariant(), @"[\s-]+")
                .Where(word => word != "and");
            var hasScale = false;
            decimal total = 0;
            decimal group = 0;
            foreach (var word in words)
            {
                if (Values.TryGetValue(word, out var value))
                {
                    group += value;
                }
                else if (word == "hundred")
                {
                    group *= 100;
                    hasScale = true;
                }
                else
                {
                    var multiplier = word switch
                    {
                        "thousand" => 1_000m,
                        "lakh" or "lakhs" or "lac" or "lacs" => 100_000m,
                        "crore" or "crores" => 10_000_000m,
                        _ => 0m
                    };
                    total += group * multiplier;
                    group = 0;
                    hasScale = true;
                }
            }

            var amount = total + group;
            var onlyAmount = text.Trim().TrimEnd('.', '!', '?') == match.Value.Trim();
            var preceding = text[..match.Index];
            var hasAmountContext = Regex.IsMatch(preceding, @"\b(?:for|paid|spent|received)\s+$",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (amount > 0 && amount <= 100_000_000m
                && (hasScale || match.Groups["currency"].Success || onlyAmount || hasAmountContext))
            {
                return (amount, match.Index, match.Length);
            }
        }

        return null;
    }

    public static Match? FindConflictingCurrencyTranscript(string text)
    {
        // Speech recognition can render "six fifty" as "six ₹50". Never silently save ₹50.
        var match = Regex.Match(text,
            @"(?<![\p{L}\p{N}])(?:one|two|three|four|five|six|seven|eight|nine)\s+(?:₹|rs\.?|inr)\s*\d{1,2}(?!\d)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return match.Success ? match : null;
    }
}
