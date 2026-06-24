using System.Text.RegularExpressions;

namespace MoneyMentor.Application.InputParsing;

internal static class ExpenseInputTextNormalizer
{
    private const int MaxPhraseWords = 4;

    private static readonly Regex SearchTextCleanupRegex = new(
        @"[^\p{L}\p{N}]+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex WhitespaceRegex = new(
        @"\s+",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static IReadOnlySet<string> CreateTermSet(string value)
    {
        var normalizedText = NormalizeKeyword(value);
        var terms = new HashSet<string>(StringComparer.Ordinal);

        if (normalizedText.Length == 0)
        {
            return terms;
        }

        var words = normalizedText.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        foreach (var word in words)
        {
            terms.Add(word);
        }

        for (var phraseLength = 2; phraseLength <= Math.Min(MaxPhraseWords, words.Length); phraseLength++)
        {
            for (var start = 0; start <= words.Length - phraseLength; start++)
            {
                terms.Add(string.Join(' ', words.AsSpan(start, phraseLength)));
            }
        }

        return terms;
    }

    public static string ToSearchText(string value) =>
        $" {NormalizeKeyword(value)} ";

    public static string NormalizeKeyword(string value) =>
        CollapseWhitespace(ReplaceNonSearchCharacters(value.ToLowerInvariant(), " ")).Trim();

    public static string ReplaceNonSearchCharacters(string value, string replacement) =>
        SearchTextCleanupRegex.Replace(value, replacement);

    public static string CollapseWhitespace(string value) =>
        WhitespaceRegex.Replace(value, " ");

    public static string RemoveWhitespace(string value) =>
        WhitespaceRegex.Replace(value, string.Empty);

    public static int CountWords(string value) =>
        string.IsNullOrWhiteSpace(value)
            ? 0
            : value.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
}
