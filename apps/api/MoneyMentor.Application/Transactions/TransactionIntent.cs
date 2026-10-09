using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;
namespace MoneyMentor.Application.Transactions;

// Common contract for text, normalized OCR, API ingestion, and future imports.
public sealed record TransactionIntent(TransactionKind EventKind, decimal Amount, DateOnly? Date = null)
{
    public Guid? HouseholdId { get; init; }
    public Guid? AccountId { get; init; }
    public Guid? CounterpartyAccountId { get; init; }
    public string? AccountAlias { get; init; }
    public string? CounterpartyAccountAlias { get; init; }
    public PaymentChannel? PaymentChannel { get; init; }
    public Guid? CategoryId { get; init; }
    public string? CategoryName { get; init; }
    public string? Merchant { get; init; }
    public string? Description { get; init; }
    public string SourceText { get; init; } = string.Empty;
    public InputMode InputMode { get; init; } = InputMode.Text;
    public Guid? RelatedTransactionId { get; init; }
    public bool MatchOriginal { get; init; } = true;
    public string? ExternalReference { get; init; }
    public TransactionVisibility? Visibility { get; init; }
}
public interface IFinancialEventService
{
    Task<TransactionModel> SaveAsync(AppUserContext user, TransactionIntent intent, CancellationToken ct);
}
public class FinancialTransactionValidationException(string message) : Exception(message);
public sealed record TransactionMatchCandidate(Guid Id, decimal Amount, DateOnly Date, string? Merchant, string? Description);
public sealed class TransactionMatchRequiredException(IReadOnlyList<TransactionMatchCandidate> candidates)
    : FinancialTransactionValidationException("Choose the original transaction or record an unlinked refund.")
{
    public IReadOnlyList<TransactionMatchCandidate> Candidates { get; } = candidates;
}
