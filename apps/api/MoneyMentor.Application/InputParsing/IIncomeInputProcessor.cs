namespace MoneyMentor.Application.InputParsing;

public interface IIncomeInputProcessor
{
    bool HasPendingDraft(IncomeInputParseRequest request);

    Task<IncomeInputProcessResult> ProcessAsync(
        IncomeInputParseRequest request,
        CancellationToken cancellationToken);
}
