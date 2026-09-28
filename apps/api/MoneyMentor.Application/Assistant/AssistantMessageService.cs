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
    TimeProvider? timeProvider = null,
    AssistantConfirmationStore? confirmationStore = null) : IAssistantMessageService
{
    public async Task<AssistantMessageResult> ProcessAsync(
        AssistantMessageCommand command,
        CancellationToken cancellationToken)
    {
        if (command.ConfirmationToken is not null)
        {
            var confirmed = command.ProcessingMode == AssistantProcessingMode.Execute
                ? confirmationStore?.Take(command.ConfirmationToken, command) : null;
            if (confirmed is null || !confirmed.CanExecute)
                return new AssistantMessageResult(AssistantMessageStatus.NeedsClarification, FinanceInputIntent.Unknown,
                    "This preview expired or was already used. Check your transactions before creating a new preview.", null, null, null, []);
            // Use the exact server draft and original scope, never client-supplied transaction fields.
            command = confirmed.Command with { ProcessingMode = AssistantProcessingMode.Execute, ConfirmationToken = null, ClarificationToken = null };
            if (confirmed.Expense is { } expense)
            {
                var result = await expenseInputProcessor.ProcessAsync(new ExpenseInputParseRequest(command.Text,
                    command.AuthProvider, command.AuthSubject, command.HouseholdId, command.InputMode,
                    command.TransactionDate, command.CurrencyCode, command.Locale, command.Email, command.DisplayName)
                    { ConfirmedDraft = expense }, cancellationToken);
                return new AssistantMessageResult(ToAssistantStatus(result.Status), result.Intent, result.AssistantMessage,
                    result.Transaction, result.ParsedDebug, null, result.Errors);
            }
            if (confirmed.Income is { } income)
            {
                var result = await incomeInputProcessor.ProcessAsync(new IncomeInputParseRequest(command.Text,
                    command.AuthProvider, command.AuthSubject, command.HouseholdId, command.InputMode,
                    command.TransactionDate, command.CurrencyCode, command.Locale, command.Email, command.DisplayName)
                    { ConfirmedDraft = income }, cancellationToken);
                return new AssistantMessageResult(ToAssistantStatus(result.Status), result.Intent, result.AssistantMessage,
                    result.Transaction, null, null, result.Errors) { ParsedIncomeDebug = result.ParsedDebug };
            }
        }
        AssistantConfirmationStore.Entry? continuation = null;
        if (command.ClarificationToken is not null)
        {
            continuation = command.ProcessingMode == AssistantProcessingMode.Preview && command.ConfirmationToken is null
                ? confirmationStore?.Take(command.ClarificationToken, command) : null;
            if (continuation is null)
                return new AssistantMessageResult(AssistantMessageStatus.NeedsClarification, FinanceInputIntent.Unknown,
                    "This preview expired. Use Edit text to preview the full payment again.", null, null, null, []);
            command = continuation.Command with { Text = command.Text, ProcessingMode = AssistantProcessingMode.Preview,
                ConfirmationToken = null, ClarificationToken = null };
        }
        var preview = command.InputMode == InputMode.Image || command.ProcessingMode == AssistantProcessingMode.Preview;
        var text = command.Text.Trim();
        var combinedText = continuation is null ? text : $"{continuation.Command.Text}\n{text}";
        if (combinedText.Length > 4000)
            return new AssistantMessageResult(AssistantMessageStatus.NeedsClarification, FinanceInputIntent.Unknown,
                "This preview is too long. Use Edit text to shorten it and preview again.", null, null, null, []);
        var paymentState = PaymentTextSignals.GetState(combinedText);
        if (PaymentTextSignals.IsBlocked(combinedText))
            return new AssistantMessageResult(AssistantMessageStatus.Unsupported, FinanceInputIntent.Unknown,
                "This payment is failed or pending. Nothing was tracked.", null, null, null, []) { PaymentState = paymentState };
        GoalInputDraft? pendingGoalDraft = null;
        if (!preview && goalDraftStore?.TryGet(command.AuthProvider, command.AuthSubject, out pendingGoalDraft) == true)
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

        if (continuation is not null)
            intent = continuation.Income is not null ? FinanceInputIntent.CreateIncome : FinanceInputIntent.CreateExpense;

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
            if (preview)
                return new AssistantMessageResult(AssistantMessageStatus.Unsupported, intent,
                    "Image previews cannot create goals. Type your goal separately.", null, null, null, []);
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
            command.DisplayName) { ProcessingMode = preview ? AssistantProcessingMode.Preview : AssistantProcessingMode.Execute, PreviewDraft = continuation?.Income };
        var hasExplicitExpensePaymentSignal = ExpenseInputKeywordSets.ExpensePaymentSignals.Any(
            ExpenseInputTextNormalizer.CreateTermSet(text).Contains);

        if (intent == FinanceInputIntent.CreateIncome
            || (!preview && !hasExplicitExpensePaymentSignal
                && incomeInputProcessor.HasPendingDraft(incomeRequest)))
        {
            var incomeResult = await incomeInputProcessor.ProcessAsync(
                incomeRequest,
                cancellationToken);

            var incomeToken = preview && incomeResult.ParsedDebug is not null
                ? confirmationStore?.Add(command with { Text = combinedText }, null, incomeResult.ParsedDebug, incomeResult.Status == IncomeInputParseStatus.Parsed) : null;
            return new AssistantMessageResult(
                ToAssistantStatus(incomeResult.Status),
                incomeResult.Intent,
                incomeResult.AssistantMessage,
                incomeResult.Transaction,
                null,
                null,
                incomeResult.Errors)
            {
                ConfirmationToken = incomeResult.Status == IncomeInputParseStatus.Parsed ? incomeToken : null,
                ClarificationToken = incomeToken,
                PaymentState = preview ? paymentState : null,
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
                command.DisplayName) { ProcessingMode = preview ? AssistantProcessingMode.Preview : AssistantProcessingMode.Execute, PreviewDraft = continuation?.Expense },
            cancellationToken);

        var expenseToken = preview && expenseResult.ParsedDebug is not null
            ? confirmationStore?.Add(command with { Text = combinedText }, expenseResult.ParsedDebug, null, expenseResult.Status == ExpenseInputParseStatus.Parsed) : null;
        return new AssistantMessageResult(
            ToAssistantStatus(expenseResult.Status),
            expenseResult.Intent,
            expenseResult.AssistantMessage,
            expenseResult.Transaction,
            expenseResult.ParsedDebug,
            null,
            expenseResult.Errors)
        {
            ConfirmationToken = expenseResult.Status == ExpenseInputParseStatus.Parsed ? expenseToken : null,
            ClarificationToken = expenseToken,
            PaymentState = preview ? paymentState : null
        };
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
