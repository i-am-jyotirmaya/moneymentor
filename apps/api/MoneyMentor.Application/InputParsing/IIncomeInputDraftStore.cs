namespace MoneyMentor.Application.InputParsing;

public interface IIncomeInputDraftStore
{
    IncomeDraft? Get(IncomeInputParseRequest request);

    void Save(IncomeInputParseRequest request, IncomeDraft draft);

    void Clear(IncomeInputParseRequest request);
}
