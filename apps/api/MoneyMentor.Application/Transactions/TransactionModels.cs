using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Transactions;

public sealed record TransactionModel(
    Guid Id,
    Guid HouseholdId,
    Guid UserProfileId,
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
    string? UpdatedByDisplayName);

public sealed record UpdateTransactionCommand(
    decimal? Amount,
    string? CategoryName,
    string? MerchantName,
    string? Description,
    DateOnly? TransactionDate,
    TransactionVisibility? Visibility);

public sealed record SaveExpenseCommand(
    AppUserContext UserContext,
    ExpenseDraft Draft,
    Guid? RequestedHouseholdId);
