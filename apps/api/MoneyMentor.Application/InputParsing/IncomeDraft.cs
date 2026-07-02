using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.InputParsing;

public sealed record IncomeDraft(
    decimal? Amount,
    string? SenderName,
    string? Reason,
    DateOnly? TransactionDate,
    string SourceText,
    InputMode InputMode,
    decimal Confidence,
    IReadOnlyCollection<IncomeDraftMissingField> MissingFields);
