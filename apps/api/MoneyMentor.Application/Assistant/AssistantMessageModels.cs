using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Assistant;

public enum AssistantMessageStatus
{
    Responded,
    NeedsClarification,
    Unsupported,
    Failed
}

public sealed record AssistantMessageCommand(
    string Text,
    string AuthProvider,
    string AuthSubject,
    Guid? HouseholdId,
    InputMode InputMode,
    DateOnly? TransactionDate,
    string? CurrencyCode,
    string? Locale,
    string? Email,
    string? DisplayName);

public sealed record AssistantMessageResult(
    AssistantMessageStatus Status,
    FinanceInputIntent Intent,
    string? AssistantMessage,
    TransactionModel? Transaction,
    ExpenseDraft? ParsedDebug,
    FinanceQuestionAnswerModel? FinanceAnswer,
    IReadOnlyCollection<string> Errors);

public interface IAssistantMessageService
{
    Task<AssistantMessageResult> ProcessAsync(
        AssistantMessageCommand command,
        CancellationToken cancellationToken);
}
