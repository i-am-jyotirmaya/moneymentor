using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;
using System.Globalization;
using System.Text.RegularExpressions;

namespace MoneyMentor.Application.Assistant;

public sealed class AssistantMessageService(
    IFinanceInputClassifier inputClassifier,
    IExpenseInputProcessor expenseInputProcessor,
    IIncomeInputProcessor incomeInputProcessor,
    IAppUserProfileService appUserProfileService,
    IFinanceQuestionService financeQuestionService,
    IGoalService? goalService = null,
    IGoalPlanningService? goalPlanningService = null,
    IGoalInputDraftStore? goalDraftStore = null,
    TimeProvider? timeProvider = null) : IAssistantMessageService
{
    public async Task<AssistantMessageResult> ProcessAsync(
        AssistantMessageCommand command,
        CancellationToken cancellationToken)
    {
        var text = command.Text.Trim();
        GoalInputDraft? pendingGoalDraft = null;
        if (goalDraftStore?.TryGet(command.AuthProvider, command.AuthSubject, out pendingGoalDraft) == true)
        {
            if (text.Equals("cancel", StringComparison.OrdinalIgnoreCase))
            {
                goalDraftStore.Remove(command.AuthProvider, command.AuthSubject);
                return new AssistantMessageResult(
                    AssistantMessageStatus.Responded,
                    FinanceInputIntent.AskGoalAdvice,
                    "Cancelled the unfinished goal.",
                    null, null, null, []);
            }
            text = $"{pendingGoalDraft!.SourceText} {text}";
        }
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
                    command.TransactionDate ?? userContext.CurrentDate,
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
            if (goalService is null)
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

            var userContext = await appUserProfileService.ResolveAsync(
                new AppUserIdentity(
                    command.AuthProvider,
                    command.AuthSubject,
                    command.Email,
                    command.DisplayName),
                cancellationToken);
            if (LooksLikeGoalCreation(text) || pendingGoalDraft is not null)
            {
                var draft = ParseGoalDraft(text, userContext.CurrentDate);
                if (draft.TargetAmount is null)
                {
                    goalDraftStore?.Set(
                        command.AuthProvider,
                        command.AuthSubject,
                        draft with
                        {
                            ExpiresAt = (timeProvider ?? TimeProvider.System)
                                .GetUtcNow().AddMinutes(20)
                        });
                    return new AssistantMessageResult(
                        AssistantMessageStatus.NeedsClarification,
                        intent,
                        "What target amount would you like to save?",
                        null, null, null, []);
                }

                var targetDate = draft.TargetDate
                    ?? (draft.DurationMonths is null
                        ? null
                        : userContext.CurrentDate.AddMonths(draft.DurationMonths.Value));
                var created = await goalService.CreateAsync(
                    new CreateGoalCommand(
                        userContext,
                        command.HouseholdId,
                        draft.Name,
                        FinancialGoalType.Saving,
                        draft.TargetAmount.Value,
                        targetDate,
                        null,
                        FinancialGoalPriority.Medium,
                        false),
                    cancellationToken);
                goalDraftStore?.Remove(command.AuthProvider, command.AuthSubject);

                GoalPlanningRunModel? planningRun = null;
                if (goalPlanningService is not null && userContext.HasCurrentPrivacyConsent)
                {
                    planningRun = await goalPlanningService.CreateRunAsync(
                        new CreateGoalPlanningRunCommand(
                            userContext,
                            created.Id,
                            draft.Pace,
                            targetDate,
                            null,
                            [],
                            command.Locale,
                            $"assistant-{Guid.NewGuid():N}"),
                        cancellationToken);
                }
                var response = planningRun is null
                    ? $"Created {created.Name} with a target of {created.TargetAmount:0.##}."
                    : $"Created {created.Name} with a target of {created.TargetAmount:0.##}. I’m preparing your plan now.";
                return new AssistantMessageResult(
                    AssistantMessageStatus.Responded,
                    intent,
                    response,
                    null, null, null, [])
                {
                    Goal = created,
                    GoalPlanningRun = planningRun
                };
            }

            var goals = await goalService.ListAsync(
                userContext,
                command.HouseholdId,
                cancellationToken);
            var activeGoals = goals
                .Where(goal => goal.Status == FinancialGoalStatus.Active)
                .OrderByDescending(goal => goal.Priority)
                .ThenBy(goal => goal.TargetDate)
                .Take(3)
                .ToArray();
            var message = activeGoals.Length == 0
                ? "You do not have active goals yet. Add a target amount and target date, and I can tell you the monthly contribution needed."
                : BuildGoalAdviceMessage(activeGoals);

            return new AssistantMessageResult(
                AssistantMessageStatus.Responded,
                intent,
                message,
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

    private static string BuildGoalAdviceMessage(IReadOnlyCollection<GoalModel> goals)
    {
        var lines = goals.Select(goal =>
        {
            var required = goal.RequiredMonthlyContribution is null
                ? "set a target date to calculate the monthly contribution"
                : $"{goal.RequiredMonthlyContribution:0.##}/month";
            var remaining = $"{goal.RemainingAmount:0.##} remaining";
            return $"{goal.Name}: {remaining}; {required}.";
        });

        return "Here is the current goal picture: " + string.Join(" ", lines);
    }

    private static bool LooksLikeGoalCreation(string text) =>
        Regex.IsMatch(
            text,
            @"\b(i\s+want\s+to|want\s+to|plan\s+to|goal\s+to)\s+(save|build|set\s+aside)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    private static GoalInputDraft ParseGoalDraft(string text, DateOnly currentDate)
    {
        var amountMatch = Regex.Match(
            text,
            @"\b(?<amount>\d+(?:\.\d+)?)\s*(?<unit>crore|cr|lakh|lac|k|thousand)?\b(?!\s*(?:months?|years?)\b)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        decimal? amount = null;
        if (amountMatch.Success
            && decimal.TryParse(
                amountMatch.Groups["amount"].Value,
                NumberStyles.Number,
                CultureInfo.InvariantCulture,
                out var parsed))
        {
            var multiplier = amountMatch.Groups["unit"].Value.ToLowerInvariant() switch
            {
                "crore" or "cr" => 10_000_000m,
                "lakh" or "lac" => 100_000m,
                "k" or "thousand" => 1_000m,
                _ => 1m
            };
            amount = parsed * multiplier;
        }

        var durationMatch = Regex.Match(
            text,
            @"\b(?:in|over)\s+(?<count>\d+)\s*(?<unit>months?|years?)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        int? durationMonths = null;
        if (durationMatch.Success
            && int.TryParse(durationMatch.Groups["count"].Value, out var count))
        {
            durationMonths = durationMatch.Groups["unit"].Value.StartsWith(
                "year", StringComparison.OrdinalIgnoreCase)
                ? count * 12
                : count;
        }

        GoalPlanPace? pace = Regex.IsMatch(text, @"\bcomfortable\b", RegexOptions.IgnoreCase)
            ? GoalPlanPace.Comfortable
            : Regex.IsMatch(text, @"\baggressive\b", RegexOptions.IgnoreCase)
                ? GoalPlanPace.Aggressive
                : Regex.IsMatch(text, @"\bbalanced\b", RegexOptions.IgnoreCase)
                    ? GoalPlanPace.Balanced
                    : null;
        var nameMatch = Regex.Match(
            text,
            @"\b(?:for|towards?)\s+(?<name>[a-z][a-z\s-]{1,50}?)(?=\s+(?:in|over|by)\b|$)",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        var name = nameMatch.Success
            ? CultureInfo.InvariantCulture.TextInfo.ToTitleCase(nameMatch.Groups["name"].Value.Trim())
            : "Savings goal";
        return new GoalInputDraft(
            text,
            name,
            amount,
            durationMonths,
            durationMonths is null ? null : currentDate.AddMonths(durationMonths.Value),
            pace,
            DateTimeOffset.UtcNow.AddMinutes(20));
    }
}
