namespace MoneyMentor.Application.InputParsing;

public sealed class HeuristicFinanceInputClassifier : IFinanceInputClassifier
{
    public Task<FinanceInputIntent> ClassifyAsync(
        FinanceInputClassificationRequest request,
        CancellationToken cancellationToken)
    {
        var terms = ExpenseInputTextNormalizer.CreateTermSet(request.SourceText);

        if (terms.Count == 0)
        {
            return Task.FromResult(FinanceInputIntent.Unknown);
        }

        if (ContainsAny(terms, ExpenseInputKeywordSets.FinanceQuestionSignals)
            || LooksLikeFinanceQuestion(request.SourceText))
        {
            return Task.FromResult(FinanceInputIntent.AskFinanceQuestion);
        }

        if (ContainsAny(terms, ExpenseInputKeywordSets.GoalSignals))
        {
            return Task.FromResult(FinanceInputIntent.AskGoalAdvice);
        }

        if (ContainsAny(terms, ExpenseInputKeywordSets.IncomeSignals))
        {
            return Task.FromResult(FinanceInputIntent.CreateIncome);
        }

        if (IsLikelyClarification(request.SourceText, terms))
        {
            return Task.FromResult(FinanceInputIntent.ClarificationResponse);
        }

        if (ContainsAny(terms, ExpenseInputKeywordSets.ExpenseSignals)
            || HasAmount(request.SourceText)
            || HasKnownExpenseMerchant(terms))
        {
            return Task.FromResult(FinanceInputIntent.CreateExpense);
        }

        return Task.FromResult(FinanceInputIntent.Unknown);
    }

    private static bool ContainsAny(
        IReadOnlySet<string> terms,
        IReadOnlySet<string> keywords) =>
        keywords.Any(terms.Contains);

    private static bool LooksLikeFinanceQuestion(string sourceText)
    {
        var normalizedText = ExpenseInputTextNormalizer.NormalizeKeyword(sourceText);
        return normalizedText.Contains("where did i spend", StringComparison.Ordinal)
            || normalizedText.Contains("spent most", StringComparison.Ordinal)
            || normalizedText.Contains("spend most", StringComparison.Ordinal)
            || normalizedText.Contains("how much did i spend", StringComparison.Ordinal);
    }

    private static bool IsLikelyClarification(
        string sourceText,
        IReadOnlySet<string> terms) =>
        HasAmount(sourceText) && terms.Count <= 3
        || terms.Contains("from") && terms.Count <= 4;

    private static bool HasAmount(string sourceText) =>
        sourceText.Any(char.IsDigit);

    private static bool HasKnownExpenseMerchant(IReadOnlySet<string> terms) =>
        terms.Contains("zepto")
        || terms.Contains("swiggy")
        || terms.Contains("zomato")
        || terms.Contains("amazon");
}
