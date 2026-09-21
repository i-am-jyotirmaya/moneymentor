using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Assistant;

public sealed class MultimodalAssistantTests
{
    private const string Payment = "Payment successful\n₹649.00\nPaid to\nSWIGGY LIMITED\nUPI transaction ID\n625163091872\nPaid from\nHDFC Bank XX1234\n20 Sep 2026, 8:43 PM";
    private static AssistantMessageCommand Command(string text, InputMode mode = InputMode.Image) =>
        new(text, "local", "person", null, mode, null, "INR", "en-IN", null, null);

    [Theory]
    [InlineData(InputMode.Text, "Spent 850 at Reliance yesterday")]
    [InlineData(InputMode.Voice, "Spent 850 at Reliance yesterday")]
    [InlineData(InputMode.Image, "Payment successful\n₹850\nPaid to Reliance Retail\nYesterday")]
    public async Task ModalitiesUseSameClassifierAndExpenseProcessor(InputMode mode, string text)
    {
        var f = new Fixture();
        var result = await f.Service.ProcessAsync(Command(text, mode), default);
        Assert.Equal(1, f.Parser.Calls);
        Assert.Equal(FinanceInputIntent.CreateExpense, result.Intent);
        Assert.Equal(850m, result.ParsedDebug!.Amount);
        Assert.Equal(new DateOnly(2026, 9, 20), result.ParsedDebug.TransactionDate);
        Assert.Equal(mode == InputMode.Image ? 0 : 1, f.Transactions.Saves);
    }

    [Theory]
    [InlineData(AssistantProcessingMode.Preview)]
    [InlineData(AssistantProcessingMode.Execute)]
    public async Task ImageAlwaysPreviewsAndConfirmationSavesExactServerDraft(AssistantProcessingMode mode)
    {
        var f = new Fixture();
        var preview = await f.Service.ProcessAsync(Command(Payment) with { ProcessingMode = mode }, default);
        Assert.Null(preview.Transaction);
        Assert.Equal(0, f.Transactions.Saves);
        Assert.Equal(649m, preview.ParsedDebug!.Amount);
        Assert.Equal("Swiggy", preview.ParsedDebug.MerchantName);
        Assert.Equal(new DateOnly(2026, 9, 20), preview.ParsedDebug.TransactionDate);
        Assert.Equal(PaymentState.Success, preview.PaymentState);
        Assert.NotNull(preview.ConfirmationToken);
        var confirm = Command("spent 90000 at some other merchant") with { ConfirmationToken = preview.ConfirmationToken };
        var saved = await f.Service.ProcessAsync(confirm, default);
        Assert.Equal(649m, saved.Transaction!.Amount);
        Assert.Equal(preview.ParsedDebug, f.Transactions.Expense);
        Assert.Equal(1, f.Parser.Calls); // Confirmation must not reparse/change dates or meaning.
        Assert.Equal(1, f.Transactions.Saves);
        var replay = await f.Service.ProcessAsync(confirm, default);
        Assert.Null(replay.Transaction);
        Assert.Equal(1, f.Transactions.Saves);
    }

    [Theory]
    [InlineData(InputMode.Text)]
    [InlineData(InputMode.Voice)]
    public async Task ExplicitPreviewAlsoWorksForTextAndVoice(InputMode mode)
    {
        var f = new Fixture();
        var result = await f.Service.ProcessAsync(Command("spent 850 at Reliance", mode) with { ProcessingMode = AssistantProcessingMode.Preview }, default);
        Assert.NotNull(result.ConfirmationToken);
        Assert.Null(result.Transaction);
        Assert.Equal(0, f.Transactions.Saves);
    }

    [Theory]
    [InlineData("Payment failed\n₹850\nReliance")]
    [InlineData("Payment processing\n₹850")]
    [InlineData("Payment pending\n₹850\nReliance")]
    [InlineData("Payment successful\nPayment failed\n₹850")]
    public async Task FailedOrPendingPaymentsCannotPersist(string text)
    {
        foreach (var mode in new[] { InputMode.Text, InputMode.Voice, InputMode.Image })
        {
            var f = new Fixture();
            var result = await f.Service.ProcessAsync(Command(text, mode), default);
            Assert.Null(result.Transaction);
            Assert.Null(result.ConfirmationToken);
            Assert.Equal(0, f.Transactions.Saves);
        }
    }

    [Fact]
    public async Task AmbiguousAmountsNeedClarificationAndUnknownStatusNeedsConfirmation()
    {
        var f = new Fixture();
        var ambiguous = await f.Service.ProcessAsync(Command("Reliance\n₹850\n₹350"), default);
        Assert.Equal(AssistantMessageStatus.NeedsClarification, ambiguous.Status);
        Assert.Null(ambiguous.ParsedDebug!.Amount);
        Assert.Null(ambiguous.ConfirmationToken);
        var unknown = await f.Service.ProcessAsync(Command("Reliance\n₹850"), default);
        Assert.Equal(PaymentState.Unknown, unknown.PaymentState);
        Assert.NotNull(unknown.ConfirmationToken);
        Assert.Equal(0, f.Transactions.Saves);
    }

    [Fact]
    public async Task TokensAreBoundToIdentityAndHouseholdAndExpire()
    {
        var f = new Fixture();
        var preview = await f.Service.ProcessAsync(Command(Payment), default);
        var confirm = Command(Payment) with { ConfirmationToken = preview.ConfirmationToken };
        foreach (var wrong in new[] { confirm with { AuthSubject = "other" }, confirm with { AuthProvider = "other" }, confirm with { HouseholdId = Guid.NewGuid() } })
            Assert.Null((await f.Service.ProcessAsync(wrong, default)).Transaction);
        f.Clock.Now = f.Clock.Now.AddMinutes(11);
        Assert.Null((await f.Service.ProcessAsync(confirm, default)).Transaction);
        Assert.Equal(0, f.Transactions.Saves);
    }

    [Fact]
    public async Task ImagesDoNotMergeOrConsumePendingExpenseOrIncomeDrafts()
    {
        var f = new Fixture();
        await f.Service.ProcessAsync(Command("ice cream from zepto", InputMode.Text), default);
        await f.Service.ProcessAsync(Command("received salary", InputMode.Text), default);
        var preview = await f.Service.ProcessAsync(Command(Payment), default);
        Assert.Equal(649m, preview.ParsedDebug!.Amount);
        Assert.Null(preview.ParsedIncomeDebug);
        await f.Service.ProcessAsync(Command(Payment) with { ConfirmationToken = preview.ConfirmationToken }, default);
        Assert.NotNull(f.Expenses.Get(new("", "local", "person", null, InputMode.Text, null, "INR", "en-IN")));
        Assert.NotNull(f.Incomes.Get(new("", "local", "person", null, InputMode.Text, null, "INR", "en-IN")));
        Assert.Equal(1, f.Transactions.Saves);
    }

    [Fact]
    public async Task IncomePreviewUsesExistingIncomeProcessor()
    {
        var f = new Fixture();
        var preview = await f.Service.ProcessAsync(Command("Payment successful\nReceived ₹500 from Joe"), default);
        Assert.NotNull(preview.ParsedIncomeDebug);
        Assert.Equal(500m, preview.ParsedIncomeDebug.Amount);
        Assert.Equal(0, f.Transactions.Saves);
        var saved = await f.Service.ProcessAsync(Command("ignored") with { ConfirmationToken = preview.ConfirmationToken }, default);
        Assert.Equal(TransactionType.Income, saved.Transaction!.Type);
        Assert.Equal(preview.ParsedIncomeDebug, f.Transactions.Income);
    }

    [Fact]
    public async Task MerchantRequirementAndGoalPreviewNeverPersist()
    {
        var f = new Fixture(requireMerchant: true);
        var preview = await f.Service.ProcessAsync(Command("Payment successful\n₹850"), default);
        Assert.Equal(AssistantMessageStatus.NeedsClarification, preview.Status);
        Assert.Null(preview.ConfirmationToken);
        var goal = await f.Service.ProcessAsync(Command("I want to save 3 lakh in 8 months"), default);
        Assert.Equal(AssistantMessageStatus.Unsupported, goal.Status);
        Assert.Equal(0, f.Transactions.Saves);
    }

    [Fact]
    public async Task DirectProcessorImageRequestCannotBypassPreview()
    {
        var f = new Fixture();
        var result = await f.ExpenseProcessor.ProcessAsync(new(Payment, "local", "person", null, InputMode.Image, null, "INR", "en-IN"), default);
        Assert.NotNull(result.ParsedDebug);
        Assert.Null(result.Transaction);
        Assert.Equal(0, f.Transactions.Saves);
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = new(2026, 9, 21, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class CountingParser : IExpenseInputParser
    {
        public int Calls;
        public Task<ExpenseInputParseResult> ParseAsync(ExpenseInputParseRequest request, CancellationToken cancellationToken)
        { Calls++; return new HeuristicExpenseInputParser().ParseAsync(request, cancellationToken); }
    }
    private sealed class Fixture
    {
        public readonly Clock Clock = new();
        public readonly Transactions Transactions = new();
        public readonly CountingParser Parser = new();
        public readonly InMemoryExpenseInputDraftStore Expenses = new();
        public readonly InMemoryIncomeInputDraftStore Incomes = new();
        public readonly ExpenseInputProcessor ExpenseProcessor;
        public readonly AssistantMessageService Service;
        public Fixture(bool requireMerchant = false)
        {
            var profiles = new Profiles(requireMerchant);
            ExpenseProcessor = new(Parser, profiles, Expenses, Transactions);
            Service = new(new HeuristicFinanceInputClassifier(), ExpenseProcessor,
                new IncomeInputProcessor(new HeuristicIncomeInputParser(), profiles, Incomes, Transactions), profiles,
                new Questions(), confirmationStore: new AssistantConfirmationStore(Clock));
        }
    }
    private sealed class Profiles(bool requireMerchant) : IAppUserProfileService
    {
        public Task<AppUserContext> ResolveAsync(AppUserIdentity identity, CancellationToken cancellationToken) => Task.FromResult(
            new AppUserContext(Guid.NewGuid(), Guid.NewGuid(), "test@example.com", "Test", "INR", "Asia/Kolkata", UserPlan.Free, requireMerchant, TransactionVisibility.Private)
            { CurrentDate = new DateOnly(2026, 9, 21) });
        public Task<UserSettingsModel> GetSettingsAsync(AppUserIdentity identity, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<UserSettingsModel> UpdateSettingsAsync(AppUserIdentity identity, UpdateUserSettingsCommand command, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
    private sealed class Questions : IFinanceQuestionService
    {
        public Task<FinanceQuestionAnswerModel> AnswerAsync(AppUserContext context, FinanceQuestionRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
    private sealed class Transactions : ITransactionService
    {
        public int Saves;
        public ExpenseDraft? Expense;
        public IncomeDraft? Income;
        public Task<TransactionModel> SaveExpenseAsync(SaveExpenseCommand command, CancellationToken cancellationToken)
        {
            Saves++; Expense = command.Draft;
            return Task.FromResult(Model(command.UserContext, command.Draft.Amount!.Value, TransactionType.Expense, command.Draft.SourceText, command.Draft.TransactionDate!.Value, command.Draft.InputMode));
        }
        public Task<TransactionModel> SaveIncomeAsync(SaveIncomeCommand command, CancellationToken cancellationToken)
        {
            Saves++; Income = command.Draft;
            return Task.FromResult(Model(command.UserContext, command.Draft.Amount!.Value, TransactionType.Income, command.Draft.SourceText, command.Draft.TransactionDate!.Value, command.Draft.InputMode));
        }
        private static TransactionModel Model(AppUserContext context, decimal amount, TransactionType type, string text, DateOnly date, InputMode mode) =>
            new(Guid.NewGuid(), context.PersonalHouseholdId, context.UserProfileId, amount, "INR", type, null, null, null, text, date, mode, 0.9m, TransactionVisibility.Private, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "Test");
        public Task<TransactionPageModel> ListAsync(AppUserContext userContext, TransactionPageQuery query, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<TransactionModel?> GetAsync(AppUserContext userContext, Guid id, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<TransactionModel?> UpdateAsync(AppUserContext userContext, Guid id, UpdateTransactionCommand command, CancellationToken cancellationToken) => throw new NotSupportedException();
    }
}
