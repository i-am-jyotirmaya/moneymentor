namespace MoneyMentor.Application.InputParsing;

public interface IIncomeInputParser
{
    Task<IncomeInputParseResult> ParseAsync(
        IncomeInputParseRequest request,
        CancellationToken cancellationToken);
}
