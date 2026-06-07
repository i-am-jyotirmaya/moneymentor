namespace MoneyMentor.Application.InputParsing;

public sealed record ExpenseInputParseResult(
    ExpenseInputParseStatus Status,
    FinanceInputIntent Intent,
    ExpenseDraft? Draft,
    string? AssistantMessage,
    IReadOnlyCollection<string> Errors)
{
    public static ExpenseInputParseResult Parsed(
        ExpenseDraft draft,
        string? assistantMessage = null) =>
        new(
            ExpenseInputParseStatus.Parsed,
            FinanceInputIntent.CreateExpense,
            draft,
            assistantMessage,
            []);

    public static ExpenseInputParseResult NeedsClarification(
        ExpenseDraft draft,
        string assistantMessage) =>
        new(
            ExpenseInputParseStatus.NeedsClarification,
            FinanceInputIntent.ClarificationResponse,
            draft,
            assistantMessage,
            []);

    public static ExpenseInputParseResult Unsupported(
        string assistantMessage) =>
        new(
            ExpenseInputParseStatus.Unsupported,
            FinanceInputIntent.Unknown,
            null,
            assistantMessage,
            []);

    public static ExpenseInputParseResult Failed(IEnumerable<string> errors) =>
        new(
            ExpenseInputParseStatus.Failed,
            FinanceInputIntent.Unknown,
            null,
            null,
            errors.ToArray());
}
