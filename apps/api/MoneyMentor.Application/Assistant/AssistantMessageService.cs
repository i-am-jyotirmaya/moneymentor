using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;

namespace MoneyMentor.Application.Assistant;

public sealed class AssistantMessageService(
    IFinanceInputClassifier inputClassifier,
    IExpenseInputProcessor expenseInputProcessor,
    IIncomeInputProcessor incomeInputProcessor,
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

        if (intent == FinanceInputIntent.AskGoalAdvice)
        {
            return new AssistantMessageResult(
                AssistantMessageStatus.Unsupported,
                intent,
                "Goal advice is not supported yet.",
                null,
                null,
                null,
                []);
        }

        var incomeRequest = new IncomeInputParseRequest(
            text,
            command.AuthProvider,
            command.AuthSubject,
            command.HouseholdId,
            command.InputMode,
            command.TransactionDate,
            command.CurrencyCode,
            command.Locale,
            command.Email,
            command.DisplayName);
        var hasExplicitExpensePaymentSignal = ExpenseInputKeywordSets.ExpensePaymentSignals.Any(
            ExpenseInputTextNormalizer.CreateTermSet(text).Contains);

        if (intent == FinanceInputIntent.CreateIncome
            || (!hasExplicitExpensePaymentSignal
                && incomeInputProcessor.HasPendingDraft(incomeRequest)))
        {
            var incomeResult = await incomeInputProcessor.ProcessAsync(
                incomeRequest,
                cancellationToken);

            return new AssistantMessageResult(
                ToAssistantStatus(incomeResult.Status),
                incomeResult.Intent,
                incomeResult.AssistantMessage,
                incomeResult.Transaction,
                null,
                null,
                incomeResult.Errors)
            {
                ParsedIncomeDebug = incomeResult.ParsedDebug
            };
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

    private static AssistantMessageStatus ToAssistantStatus(
        IncomeInputParseStatus status) =>
        status switch
        {
            IncomeInputParseStatus.Parsed => AssistantMessageStatus.Responded,
            IncomeInputParseStatus.NeedsClarification => AssistantMessageStatus.NeedsClarification,
            IncomeInputParseStatus.Unsupported => AssistantMessageStatus.Unsupported,
            _ => AssistantMessageStatus.Failed
        };
}
