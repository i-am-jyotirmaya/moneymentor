using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Domain.Finance;

namespace MoneyMentor.Application.Transactions;

public sealed record TransactionModel(
    Guid Id,
    Guid HouseholdId,
    Guid? UserProfileId,
    decimal Amount,
    string CurrencyCode,
    TransactionType Type,
    string? CategoryName,
    string? MerchantName,
    string? Description,
    string SourceText,
    DateOnly TransactionDate,
    InputMode InputMode,
    decimal Confidence,
    TransactionVisibility Visibility,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? UpdatedByDisplayName)
{
    public TransactionKind? Kind { get; init; }
    public TransactionKind? ReversedKind { get; init; }
    public Guid? AccountId { get; init; }
    public Guid? CounterpartyAccountId { get; init; }
    public PaymentChannel? PaymentChannel { get; init; }


    public Guid? CategoryId { get; init; }
    public Guid? RelatedTransactionId { get; init; }
    public string? AccountName { get; init; }
    public string? CounterpartyAccountName { get; init; }
    public TransactionFinancialImpact FinancialImpact => TransactionFinancialImpactCalculator.Calculate(Amount, Type, Kind, ReversedKind);

    public string? SenderName { get; init; }

    public string? Reason { get; init; }

    public DateTimeOffset? DeletedAt { get; init; }

    public DateTimeOffset? PurgeAfter { get; init; }

    public string? ParentCategoryName { get; init; }

    public CategoryClassification? CategoryClassification { get; init; }
}

public sealed record UpdateTransactionCommand(
    decimal? Amount,
    string? CategoryName,
    string? MerchantName,
    string? Description,
    DateOnly? TransactionDate,
    TransactionVisibility? Visibility)
{
    public Guid? CategoryId { get; init; }
    public TransactionKind? Kind { get; init; }
    public Guid? AccountId { get; init; }
    public Guid? CounterpartyAccountId { get; init; }
    public bool ClearAccount { get; init; }
    public bool ClearCounterpartyAccount { get; init; }
    public PaymentChannel? PaymentChannel { get; init; }

    public string? SenderName { get; init; }

    public string? Reason { get; init; }
}

public sealed record TransactionPageQuery(
    Guid? HouseholdId,
    DateOnly Month,
    int Page,
    int PageSize);

public sealed record TransactionPageModel(
    IReadOnlyCollection<TransactionModel> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages)
{
    public string Month { get; init; } = string.Empty;
}

public sealed record TransactionTrashModel(
    IReadOnlyCollection<TransactionModel> Items);

public sealed record SaveExpenseCommand(
    AppUserContext UserContext,
    ExpenseDraft Draft,
    Guid? RequestedHouseholdId);

public sealed record SaveIncomeCommand(
    AppUserContext UserContext,
    IncomeDraft Draft,
    Guid? RequestedHouseholdId);
