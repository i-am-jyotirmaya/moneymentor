using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Application.InputParsing;

public sealed record ExpenseInputProcessResult(
    ExpenseInputParseStatus Status,
    FinanceInputIntent Intent,
    ExpenseDraft? ParsedDebug,
    TransactionModel? Transaction,
    string? AssistantMessage,
    IReadOnlyCollection<string> Errors)
{
    public static ExpenseInputProcessResult FromParseResult(ExpenseInputParseResult parseResult) =>
        new(
            parseResult.Status,
            parseResult.Intent,
            parseResult.Draft,
            null,
            parseResult.AssistantMessage,
            parseResult.Errors);

    public static ExpenseInputProcessResult NeedsClarification(
        ExpenseDraft draft,
        string assistantMessage) =>
        new(
            ExpenseInputParseStatus.NeedsClarification,
            FinanceInputIntent.ClarificationResponse,
            draft,
            null,
            assistantMessage,
            []);

    public static ExpenseInputProcessResult Saved(
        ExpenseDraft parsedDebug,
        TransactionModel transaction,
        string assistantMessage) =>
        new(
            ExpenseInputParseStatus.Parsed,
            FinanceInputIntent.CreateExpense,
            parsedDebug,
            transaction,
            assistantMessage,
            []);
}
