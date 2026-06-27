using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Application.Transactions;

public interface ITransactionService
{
    Task<TransactionModel> SaveExpenseAsync(
        SaveExpenseCommand command,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<TransactionModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        int limit,
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
