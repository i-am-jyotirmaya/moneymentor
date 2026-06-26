namespace MoneyMentor.Application.InputParsing;

public interface IExpenseInputProcessor
{
    Task<ExpenseInputParseResult> ProcessAsync(
        ExpenseInputParseRequest request,
        CancellationToken cancellationToken);
}
