using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Application.Transactions;

public interface ITransactionService
{
    Task<TransactionModel> SaveExpenseAsync(
        SaveExpenseCommand command,
        CancellationToken cancellationToken);

    Task<TransactionModel> SaveIncomeAsync(
        SaveIncomeCommand command,
        CancellationToken cancellationToken);

    Task<TransactionPageModel> ListAsync(
        AppUserContext userContext,
        TransactionPageQuery query,
        CancellationToken cancellationToken);

    Task<TransactionModel?> GetAsync(
        AppUserContext userContext,
        Guid transactionId,
        CancellationToken cancellationToken);

    Task<TransactionModel?> UpdateAsync(
        AppUserContext userContext,
        Guid transactionId,
        UpdateTransactionCommand command,
        CancellationToken cancellationToken);
}
