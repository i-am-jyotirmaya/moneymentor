using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Assistant;

public sealed class AssistantMessageServiceTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserProfileId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task ProcessAsync_RoutesExpenseToExpenseProcessor()
    {
        var expenseProcessor = new FakeExpenseInputProcessor(
            ExpenseInputProcessResult.Saved(
                CreateDraft(540m, "Food Delivery"),
                CreateTransaction(540m, "Food Delivery"),
                "Tracked USD 540 for dinner from Swiggy under Food Delivery."));
        var service = CreateService(expenseProcessor: expenseProcessor);

        var result = await service.ProcessAsync(
            CreateCommand("swiggy dinner 540"),
            CancellationToken.None);

        Assert.Equal(AssistantMessageStatus.Responded, result.Status);
        Assert.Equal(FinanceInputIntent.CreateExpense, result.Intent);
        Assert.NotNull(result.Transaction);
        Assert.Equal(1, expenseProcessor.ProcessCount);
    }

    [Fact]
    public async Task ProcessAsync_RoutesClarificationToExpenseProcessor()
    {
        var expenseProcessor = new FakeExpenseInputProcessor(
            ExpenseInputProcessResult.NeedsClarification(
                CreateDraft(null, "Snacks"),
                "How much did you spend on ice cream?"));
        var service = CreateService(expenseProcessor: expenseProcessor);

        var result = await service.ProcessAsync(
            CreateCommand("ice cream from zepto"),
            CancellationToken.None);

        Assert.Equal(AssistantMessageStatus.NeedsClarification, result.Status);
        Assert.Equal(FinanceInputIntent.ClarificationResponse, result.Intent);
        Assert.Null(result.Transaction);
        Assert.Equal(1, expenseProcessor.ProcessCount);
    }

    [Fact]
    public async Task ProcessAsync_RoutesFinanceQuestionWithoutSavingExpense()
    {
        var expenseProcessor = new FakeExpenseInputProcessor(
            ExpenseInputProcessResult.Saved(
                CreateDraft(1m, "Groceries"),
                CreateTransaction(1m, "Groceries"),
                "Should not be used."));
        var financeQuestionService = new FakeFinanceQuestionService();
        var service = CreateService(
            expenseProcessor: expenseProcessor,
            financeQuestionService: financeQuestionService);

        var result = await service.ProcessAsync(
            CreateCommand("where did I spend most this month?"),
            CancellationToken.None);

        Assert.Equal(AssistantMessageStatus.Responded, result.Status);
        Assert.Equal(FinanceInputIntent.AskFinanceQuestion, result.Intent);
        Assert.Null(result.Transaction);
        Assert.NotNull(result.FinanceAnswer);
        Assert.Equal(0, expenseProcessor.ProcessCount);
        Assert.Equal(1, financeQuestionService.AnswerCount);
    }

    [Fact]
    public async Task ProcessAsync_RoutesIncomeToIncomeProcessor()
    {
        var expenseProcessor = new FakeExpenseInputProcessor(
            ExpenseInputProcessResult.Failed(["Should not be used."]));
        var incomeProcessor = new FakeIncomeInputProcessor(
            IncomeInputProcessResult.Saved(
                CreateIncomeDraft(300m, "Joe", "chips"),
                CreateIncomeTransaction(300m, "Joe", "chips"),
                "Tracked INR 300 received from Joe for chips."));
        var service = CreateService(
            expenseProcessor: expenseProcessor,
            incomeProcessor: incomeProcessor);

        var result = await service.ProcessAsync(
            CreateCommand("Joe sent me 300 Rs for chips"),
            CancellationToken.None);

        Assert.Equal(AssistantMessageStatus.Responded, result.Status);
        Assert.Equal(FinanceInputIntent.CreateIncome, result.Intent);
        Assert.Equal("Joe", result.ParsedIncomeDebug!.SenderName);
        Assert.Equal("chips", result.ParsedIncomeDebug.Reason);
        Assert.Equal("Joe", result.Transaction!.SenderName);
        Assert.Equal(0, expenseProcessor.ProcessCount);
        Assert.Equal(1, incomeProcessor.ProcessCount);
    }

    [Fact]
    public async Task ProcessAsync_RoutesAmountOnlyReplyToPendingIncomeProcessor()
    {
        var expenseProcessor = new FakeExpenseInputProcessor(
            ExpenseInputProcessResult.Failed(["Should not be used."]));
        var incomeProcessor = new FakeIncomeInputProcessor(
            IncomeInputProcessResult.Saved(
                CreateIncomeDraft(200000m, null, "Salary"),
                CreateIncomeTransaction(200000m, null, "Salary"),
                "Tracked INR 200000 received for Salary."),
            hasPendingDraft: true);
        var service = CreateService(
            expenseProcessor: expenseProcessor,
            incomeProcessor: incomeProcessor);

        var result = await service.ProcessAsync(
            CreateCommand("₹2,00,000."),
            CancellationToken.None);

        Assert.Equal(AssistantMessageStatus.Responded, result.Status);
        Assert.Equal(FinanceInputIntent.CreateIncome, result.Intent);
        Assert.Equal(200000m, result.Transaction!.Amount);
        Assert.Equal("Salary", result.Transaction.Reason);
        Assert.Equal(0, expenseProcessor.ProcessCount);
        Assert.Equal(1, incomeProcessor.ProcessCount);
    }

    [Fact]
    public async Task ProcessAsync_RoutesCreditCardPaymentToExpenseDespitePendingIncome()
    {
        var expenseProcessor = new FakeExpenseInputProcessor(
            ExpenseInputProcessResult.Saved(
                CreateDraft(70000m, "Bills"),
                CreateTransaction(70000m, "Bills"),
                "Tracked INR 70000 under Bills."));
        var incomeProcessor = new FakeIncomeInputProcessor(
            new IncomeInputProcessResult(
                IncomeInputParseStatus.Failed,
                FinanceInputIntent.Unknown,
                null,
                null,
                null,
                ["Should not be used."]),
            hasPendingDraft: true);
        var service = CreateService(
            expenseProcessor: expenseProcessor,
            incomeProcessor: incomeProcessor);

        var result = await service.ProcessAsync(
            CreateCommand("credit card bill 70k"),
            CancellationToken.None);

        Assert.Equal(FinanceInputIntent.CreateExpense, result.Intent);
        Assert.Equal(TransactionType.Expense, result.Transaction!.Type);
        Assert.Equal(1, expenseProcessor.ProcessCount);
        Assert.Equal(0, incomeProcessor.ProcessCount);
    }

    private static AssistantMessageService CreateService(
        FakeExpenseInputProcessor? expenseProcessor = null,
        FakeIncomeInputProcessor? incomeProcessor = null,
        FakeFinanceQuestionService? financeQuestionService = null) =>
        new(
            new HeuristicFinanceInputClassifier(),
            expenseProcessor ?? new FakeExpenseInputProcessor(
                ExpenseInputProcessResult.Failed(["No fake result configured."])),
            incomeProcessor ?? new FakeIncomeInputProcessor(
                new IncomeInputProcessResult(
                    IncomeInputParseStatus.Failed,
                    FinanceInputIntent.Unknown,
                    null,
                    null,
                    null,
                    ["No fake result configured."])),
            new FakeAppUserProfileService(),
            financeQuestionService ?? new FakeFinanceQuestionService());

    private static AssistantMessageCommand CreateCommand(string text) =>
        new(
            text,
            "local",
            "auth-subject",
            HouseholdId,
            InputMode.Text,
            new DateOnly(2026, 6, 20),
            "USD",
            "en-IN",
            "test@example.com",
            "Test User");

    private static ExpenseDraft CreateDraft(
        decimal? amount,
        string categoryName) =>
        new(
            amount,
            categoryName,
            "Swiggy",
            "dinner",
            new DateOnly(2026, 6, 20),
            "swiggy dinner 540",
            InputMode.Text,
            0.9m,
            amount is null ? [ExpenseDraftMissingField.Amount] : []);

    private static TransactionModel CreateTransaction(
        decimal amount,
        string categoryName) =>
        new(
            Guid.NewGuid(),
            HouseholdId,
            UserProfileId,
            amount,
            "USD",
            TransactionType.Expense,
            categoryName,
            "Swiggy",
            "dinner",
            "swiggy dinner 540",
            new DateOnly(2026, 6, 20),
            InputMode.Text,
            0.9m,
            TransactionVisibility.Private,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            "Test User");

    private static IncomeDraft CreateIncomeDraft(
        decimal amount,
        string? senderName,
        string reason) =>
        new(
            amount,
            senderName,
            reason,
            new DateOnly(2026, 6, 20),
            "Joe sent me 300 Rs for chips",
            InputMode.Text,
            0.95m,
            []);

    private static TransactionModel CreateIncomeTransaction(
        decimal amount,
        string? senderName,
        string reason) =>
        new TransactionModel(
            Guid.NewGuid(),
            HouseholdId,
            UserProfileId,
            amount,
            "INR",
            TransactionType.Income,
            "Other Income",
            null,
            null,
            "Joe sent me 300 Rs for chips",
            new DateOnly(2026, 6, 20),
            InputMode.Text,
            0.95m,
            TransactionVisibility.Private,
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            "Test User")
        {
            SenderName = senderName,
            Reason = reason
        };

    private sealed class FakeExpenseInputProcessor(
        ExpenseInputProcessResult result) : IExpenseInputProcessor
    {
        public int ProcessCount { get; private set; }

        public Task<ExpenseInputProcessResult> ProcessAsync(
            ExpenseInputParseRequest request,
            CancellationToken cancellationToken)
        {
            ProcessCount++;
            return Task.FromResult(result);
        }
    }

    private sealed class FakeIncomeInputProcessor(
        IncomeInputProcessResult result,
        bool hasPendingDraft = false) : IIncomeInputProcessor
    {
        public int ProcessCount { get; private set; }

        public bool HasPendingDraft(IncomeInputParseRequest request) => hasPendingDraft;

        public Task<IncomeInputProcessResult> ProcessAsync(
            IncomeInputParseRequest request,
            CancellationToken cancellationToken)
        {
            ProcessCount++;
            return Task.FromResult(result);
        }
    }

    private sealed class FakeFinanceQuestionService : IFinanceQuestionService
    {
        public int AnswerCount { get; private set; }

        public Task<FinanceQuestionAnswerModel> AnswerAsync(
            AppUserContext userContext,
            FinanceQuestionRequest request,
            CancellationToken cancellationToken)
        {
            AnswerCount++;

            return Task.FromResult(new FinanceQuestionAnswerModel(
                FinanceQuestionKind.TopSpendingCategory,
                request.Text,
                "You spent the most on Groceries: USD 500 in June 2026.",
                "2026-06",
                new DateOnly(2026, 6, 1),
                new DateOnly(2026, 6, 30),
                "USD",
                500m,
                "Groceries",
                []));
        }
    }

    private sealed class FakeAppUserProfileService : IAppUserProfileService
    {
        public Task<AppUserContext> ResolveAsync(
            AppUserIdentity identity,
            CancellationToken cancellationToken) =>
            Task.FromResult(CreateContext(identity));

        public Task<UserSettingsModel> GetSettingsAsync(
            AppUserIdentity identity,
            CancellationToken cancellationToken)
        {
            var context = CreateContext(identity);
            return Task.FromResult(new UserSettingsModel(
                context.UserProfileId,
                context.Email,
                context.DisplayName,
                context.CurrencyCode,
                context.TimeZone,
                context.Plan,
                context.RequireMerchantForExpenses,
                context.DefaultTransactionVisibility));
        }

        public Task<UserSettingsModel> UpdateSettingsAsync(
            AppUserIdentity identity,
            UpdateUserSettingsCommand command,
            CancellationToken cancellationToken) =>
            GetSettingsAsync(identity, cancellationToken);

        private static AppUserContext CreateContext(AppUserIdentity identity) =>
            new(
                UserProfileId,
                HouseholdId,
                identity.Email ?? "test@example.com",
                identity.DisplayName ?? "Test User",
                "USD",
                "Asia/Calcutta",
                UserPlan.Premium,
                false,
                TransactionVisibility.Private);
    }
}
