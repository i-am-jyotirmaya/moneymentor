using MoneyMentor.Domain.Enums;
using MoneyMentor.Application.Assistant;

namespace MoneyMentor.Application.InputParsing;

public sealed record ExpenseInputParseRequest(
    string SourceText,
    string AuthProvider,
    string AuthSubject,
    Guid? HouseholdId,
    InputMode InputMode,
    DateOnly? TransactionDate,
    string? CurrencyCode,
    string? Locale,
    string? Email = null,
    string? DisplayName = null,
    DateOnly? ReferenceDate = null)
{
    public AssistantProcessingMode ProcessingMode { get; init; }
    internal ExpenseDraft? ConfirmedDraft { get; init; }
    internal ExpenseDraft? PreviewDraft { get; init; }
    internal bool IsPreview => ProcessingMode == AssistantProcessingMode.Preview
        || (InputMode == InputMode.Image && ConfirmedDraft is null);
}
