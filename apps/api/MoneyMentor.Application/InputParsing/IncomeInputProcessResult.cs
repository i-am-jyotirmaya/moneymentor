using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Application.InputParsing;

public sealed record IncomeInputProcessResult(
    IncomeInputParseStatus Status,
    FinanceInputIntent Intent,
    IncomeDraft? ParsedDebug,
    TransactionModel? Transaction,
    string? AssistantMessage,
    IReadOnlyCollection<string> Errors)
{
    public static IncomeInputProcessResult FromParseResult(IncomeInputParseResult result) =>
        new(result.Status, result.Intent, result.Draft, null, result.AssistantMessage, result.Errors);

    public static IncomeInputProcessResult Saved(
        IncomeDraft draft,
        TransactionModel transaction,
        string assistantMessage) =>
        new(
            IncomeInputParseStatus.Parsed,
            FinanceInputIntent.CreateIncome,
            draft,
            transaction,
            assistantMessage,
            []);
}
