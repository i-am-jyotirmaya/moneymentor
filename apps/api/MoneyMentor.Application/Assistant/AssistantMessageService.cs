using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;

namespace MoneyMentor.Application.Assistant;

public sealed class AssistantMessageService(
    IFinanceInputClassifier inputClassifier,
    IExpenseInputProcessor expenseInputProcessor,
    IAppUserProfileService appUserProfileService,
    IFinanceQuestionService financeQuestionService) : IAssistantMessageService
{
    public async Task<AssistantMessageResult> ProcessAsync(
        AssistantMessageCommand command,
        CancellationToken cancellationToken)
    {
        var text = command.Text.Trim();
        var intent = await inputClassifier.ClassifyAsync(
            new FinanceInputClassificationRequest(
                text,
                command.AuthProvider,
                command.AuthSubject,
                command.Locale),
            cancellationToken);

        if (intent == FinanceInputIntent.AskFinanceQuestion)
        {
            var userContext = await appUserProfileService.ResolveAsync(
                new AppUserIdentity(
                    command.AuthProvider,
                    command.AuthSubject,
                    command.Email,
                    command.DisplayName),
                cancellationToken);
            var answer = await financeQuestionService.AnswerAsync(
                userContext,
                new FinanceQuestionRequest(
                    text,
                    command.HouseholdId,
                    command.TransactionDate,
                    command.Locale),
                cancellationToken);

            return new AssistantMessageResult(
                AssistantMessageStatus.Responded,
                FinanceInputIntent.AskFinanceQuestion,
                answer.Answer,
                null,
                null,
                answer,
                []);
        }

        if (intent is FinanceInputIntent.CreateIncome or FinanceInputIntent.AskGoalAdvice)
        {
            return new AssistantMessageResult(
                AssistantMessageStatus.Unsupported,
                intent,
                intent == FinanceInputIntent.CreateIncome
                    ? "Income capture is not supported yet."
                    : "Goal advice is not supported yet.",
                null,
                null,
                null,
                []);
        }

        var expenseResult = await expenseInputProcessor.ProcessAsync(
            new ExpenseInputParseRequest(
                text,
                command.AuthProvider,
                command.AuthSubject,
                command.HouseholdId,
                command.InputMode,
                command.TransactionDate,
                command.CurrencyCode,
                command.Locale,
                command.Email,
                command.DisplayName),
            cancellationToken);

        return new AssistantMessageResult(
            ToAssistantStatus(expenseResult.Status),
            expenseResult.Intent,
            expenseResult.AssistantMessage,
            expenseResult.Transaction,
            expenseResult.ParsedDebug,
            null,
            expenseResult.Errors);
    }

    private static AssistantMessageStatus ToAssistantStatus(
        ExpenseInputParseStatus status) =>
        status switch
        {
            ExpenseInputParseStatus.Parsed => AssistantMessageStatus.Responded,
            ExpenseInputParseStatus.NeedsClarification => AssistantMessageStatus.NeedsClarification,
            ExpenseInputParseStatus.Unsupported => AssistantMessageStatus.Unsupported,
            _ => AssistantMessageStatus.Failed
        };
}
