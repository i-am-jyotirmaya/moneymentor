namespace MoneyMentor.Application.InputParsing;

public interface IExpenseInputDraftStore
{
    ExpenseDraft? Get(ExpenseInputParseRequest request);

    void Save(ExpenseInputParseRequest request, ExpenseDraft draft);

    void Clear(ExpenseInputParseRequest request);
}
