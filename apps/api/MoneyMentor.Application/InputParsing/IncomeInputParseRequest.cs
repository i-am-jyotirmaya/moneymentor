using MoneyMentor.Domain.Enums;
using MoneyMentor.Application.Assistant;

namespace MoneyMentor.Application.InputParsing;

public sealed record IncomeInputParseRequest(
    string SourceText,
    string AuthProvider,
    string AuthSubject,
    Guid? HouseholdId,
    InputMode InputMode,
    DateOnly? TransactionDate,
    string? CurrencyCode,
    string? Locale,
    string? Email = null,
    string? DisplayName = null)
{
    public AssistantProcessingMode ProcessingMode { get; init; }
    internal IncomeDraft? ConfirmedDraft { get; init; }
    internal IncomeDraft? PreviewDraft { get; init; }
    internal bool IsPreview => ProcessingMode == AssistantProcessingMode.Preview
        || (InputMode == InputMode.Image && ConfirmedDraft is null);
}
