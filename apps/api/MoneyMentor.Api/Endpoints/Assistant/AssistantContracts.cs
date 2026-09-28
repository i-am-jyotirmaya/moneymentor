using System.ComponentModel.DataAnnotations;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Api.Endpoints.Assistant;

public sealed class AssistantMessageRequest
{
    [Required]
    [MaxLength(4000)]
    public string Text { get; init; } = string.Empty;

    public Guid? HouseholdId { get; init; }

    [MaxLength(32)]
    public string InputMode { get; init; } = "Text";

    [MaxLength(16)]
    public string ProcessingMode { get; init; } = "Execute";

    [MaxLength(64)]
    public string? ConfirmationToken { get; init; }
    public string? ClarificationToken { get; init; }

    public DateOnly? TransactionDate { get; init; }

    [MinLength(3)]
    [MaxLength(3)]
    public string? CurrencyCode { get; init; }

    [MaxLength(32)]
    public string? Locale { get; init; }
}

public sealed record AssistantMessageResponse(
    AssistantMessageStatus Status,
    FinanceInputIntent Intent,
    string? AssistantMessage,
    TransactionModel? Transaction,
    ExpenseDraft? ParsedDebug,
    FinanceQuestionAnswerModel? FinanceAnswer,
    IReadOnlyCollection<string> Errors)
{
    public string? ConfirmationToken { get; init; }
    public string? ClarificationToken { get; init; }
    public PaymentState? PaymentState { get; init; }
    public IncomeDraft? ParsedIncomeDebug { get; init; }
}
