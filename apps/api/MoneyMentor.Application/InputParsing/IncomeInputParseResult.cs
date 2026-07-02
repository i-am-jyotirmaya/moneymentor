namespace MoneyMentor.Application.InputParsing;

public sealed record IncomeInputParseResult(
    IncomeInputParseStatus Status,
    FinanceInputIntent Intent,
    IncomeDraft? Draft,
    string? AssistantMessage,
    IReadOnlyCollection<string> Errors)
{
    public static IncomeInputParseResult Parsed(IncomeDraft draft, string assistantMessage) =>
        new(IncomeInputParseStatus.Parsed, FinanceInputIntent.CreateIncome, draft, assistantMessage, []);

    public static IncomeInputParseResult NeedsClarification(IncomeDraft draft, string assistantMessage) =>
        new(IncomeInputParseStatus.NeedsClarification, FinanceInputIntent.ClarificationResponse, draft, assistantMessage, []);

    public static IncomeInputParseResult Unsupported(string assistantMessage) =>
        new(IncomeInputParseStatus.Unsupported, FinanceInputIntent.Unknown, null, assistantMessage, []);

    public static IncomeInputParseResult Failed(IEnumerable<string> errors) =>
        new(IncomeInputParseStatus.Failed, FinanceInputIntent.Unknown, null, null, errors.ToArray());
}
