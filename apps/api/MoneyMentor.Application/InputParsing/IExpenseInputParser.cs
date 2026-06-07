namespace MoneyMentor.Application.InputParsing;

public interface IExpenseInputParser
{
    Task<ExpenseInputParseResult> ParseAsync(
        ExpenseInputParseRequest request,
        CancellationToken cancellationToken);
}
