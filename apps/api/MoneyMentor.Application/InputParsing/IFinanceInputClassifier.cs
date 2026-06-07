namespace MoneyMentor.Application.InputParsing;

public interface IFinanceInputClassifier
{
    Task<FinanceInputIntent> ClassifyAsync(
        FinanceInputClassificationRequest request,
        CancellationToken cancellationToken);
}
