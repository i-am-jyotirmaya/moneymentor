namespace MoneyMentor.Application.InputParsing;

public interface IExpenseInputProcessor
{
    Task<ExpenseInputProcessResult> ProcessAsync(
        ExpenseInputParseRequest request,
        CancellationToken cancellationToken);
}
