using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.InputParsing;

public sealed record ExpenseInputParseRequest(
    string SourceText,
    string AuthProvider,
    string AuthSubject,
    Guid? HouseholdId,
    InputMode InputMode,
    DateOnly? TransactionDate,
    string? CurrencyCode,
    string? Locale);
