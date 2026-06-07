using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.InputParsing;

public sealed record ExpenseDraft(
    decimal? Amount,
    string? CategoryGuess,
    string? MerchantName,
    string? Description,
    DateOnly? TransactionDate,
    string SourceText,
    InputMode InputMode,
    decimal Confidence,
    IReadOnlyCollection<ExpenseDraftMissingField> MissingFields);
