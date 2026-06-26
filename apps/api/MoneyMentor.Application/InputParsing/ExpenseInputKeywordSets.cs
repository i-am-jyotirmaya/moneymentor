namespace MoneyMentor.Application.InputParsing;

internal static class ExpenseInputKeywordSets
{
    public static readonly IReadOnlySet<string> ExpenseSignals = CreateKeywordSet(
        "spent",
        "spend",
        "paid",
        "pay",
        "got",
        "get",
        "grabbed",
        "ordered",
        "order",
        "bought",
        "buy",
        "purchase",
        "purchased",
        "expense",
        "kharch",
        "kharcha",
        "kharch kiya",
        "diya",
        "liya");

    public static readonly IReadOnlySet<string> FinanceQuestionSignals = CreateKeywordSet(
        "where did",
        "how much",
        "how many",
        "kitna",
        "kitne",
        "kahan",
        "kidhar",
        "spend most",
        "spent most",
        "report",
        "summary",
        "budget");

    public static readonly IReadOnlySet<string> IncomeSignals = CreateKeywordSet(
        "salary",
        "income",
        "received",
        "credited",
        "bonus",
        "got paid",
        "freelance payment");

    public static readonly IReadOnlySet<string> GoalSignals = CreateKeywordSet(
        "save",
        "saving",
        "savings",
        "goal",
        "invest",
        "investment");

    public static readonly IReadOnlySet<string> AmountContextWords = CreateKeywordSet(
        "for",
        "of",
        "paid",
        "spent",
        "spend",
        "cost",
        "costing",
        "worth",
        "bill",
        "amount",
        "kharch",
        "kharcha",
        "diya",
        "rent",
        "kiraya",
        "petrol",
        "diesel",
        "grocery",
        "groceries",
        "sabzi",
        "doodh");

    public static readonly IReadOnlySet<string> MerchantStopWords = CreateKeywordSet(
        "for",
        "worth",
        "cost",
        "costing",
        "spent",
        "spend",
        "paid",
        "pay",
        "today",
        "aaj",
        "yesterday",
        "kal",
        "last",
        "this",
        "on",
        "at",
        "from",
        "via",
        "through",
        "rs",
        "inr",
        "rupees",
        "rupaye");

    public static IReadOnlySet<string> CreateKeywordSet(params string[] keywords)
    {
        var set = new HashSet<string>(StringComparer.Ordinal);

        foreach (var keyword in keywords)
        {
            var normalizedKeyword = ExpenseInputTextNormalizer.NormalizeKeyword(keyword);
            if (normalizedKeyword.Length > 0)
            {
                set.Add(normalizedKeyword);
            }
        }

        return set;
    }
}
