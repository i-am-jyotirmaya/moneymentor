using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class ExpenseInputProcessorTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserProfileId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid PersonalHouseholdId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly DateOnly DefaultTransactionDate = new(2026, 6, 24);

    [Fact]
    public async Task ProcessAsync_SavesCompleteExpense_AndReturnsSavedFeedback()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService: transactionService);

        var result = await processor.ProcessAsync(
            CreateRequest("Order food from Zomato 100"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, result.Status);
        Assert.Equal(FinanceInputIntent.CreateExpense, result.Intent);
        Assert.NotNull(result.ParsedDebug);
        Assert.NotNull(result.Transaction);
        Assert.Equal(1, transactionService.SaveCount);
        Assert.Equal("Tracked ₹100 for food from Zomato under Food Delivery.", result.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_AsksClarification_AndDoesNotSave_WhenAmountIsMissing()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService: transactionService);

        var result = await processor.ProcessAsync(
            CreateRequest("ice cream from zepto"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, result.Status);
        Assert.Equal(FinanceInputIntent.ClarificationResponse, result.Intent);
        Assert.Null(result.Transaction);
        Assert.Equal(0, transactionService.SaveCount);
        Assert.Equal("How much did you spend on ice cream?", result.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_SavesExpense_WhenAmountFollowsPendingDescription()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService: transactionService);

        var firstResult = await processor.ProcessAsync(
            CreateRequest("bought bread from zepto"),
            CancellationToken.None);
        var secondResult = await processor.ProcessAsync(
            CreateRequest("50"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal("How much did you spend on bread?", firstResult.AssistantMessage);
        Assert.Null(firstResult.Transaction);

        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.NotNull(secondResult.Transaction);
        Assert.Equal(1, transactionService.SaveCount);
        Assert.Equal(50m, secondResult.Transaction!.Amount);
        Assert.Equal("bread", secondResult.Transaction.Description);
        Assert.Equal("Zepto", secondResult.Transaction.MerchantName);
        Assert.Equal("Groceries", secondResult.Transaction.CategoryName);
        Assert.Equal("Tracked ₹50 for bread from Zepto under Groceries.", secondResult.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_MergesPendingDescription_WhenAmountAndMerchantFollow()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService: transactionService);

        var firstResult = await processor.ProcessAsync(
            CreateRequest("bought bread from zepto"),
            CancellationToken.None);
        var secondResult = await processor.ProcessAsync(
            CreateRequest("50 from zepto"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.NotNull(secondResult.Transaction);
        Assert.Equal(1, transactionService.SaveCount);
        Assert.Equal(50m, secondResult.Transaction!.Amount);
        Assert.Equal("bread", secondResult.Transaction.Description);
        Assert.Equal("Zepto", secondResult.Transaction.MerchantName);
        Assert.Equal("Groceries", secondResult.Transaction.CategoryName);
    }

    [Fact]
    public async Task ProcessAsync_SavesExpense_WhenMerchantIsMissingByDefault()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService: transactionService);

        var result = await processor.ProcessAsync(
            CreateRequest("petrol 250"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, result.Status);
        Assert.NotNull(result.Transaction);
        Assert.Equal(1, transactionService.SaveCount);
        Assert.Equal("Tracked ₹250 for petrol under Fuel.", result.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_AsksMerchant_AndDoesNotSave_WhenMerchantSettingRequiresIt()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(
            requireMerchantForExpenses: true,
            transactionService: transactionService);

        var result = await processor.ProcessAsync(
            CreateRequest("petrol 250"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, result.Status);
        Assert.Equal(FinanceInputIntent.ClarificationResponse, result.Intent);
        Assert.Null(result.Transaction);
        Assert.Equal(0, transactionService.SaveCount);
        Assert.Equal("Which merchant was this from?", result.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_SavesExpense_WhenMerchantFollowsRequiredMerchantClarification()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(
            requireMerchantForExpenses: true,
            transactionService: transactionService);

        var firstResult = await processor.ProcessAsync(
            CreateRequest("petrol 250"),
            CancellationToken.None);
        var secondResult = await processor.ProcessAsync(
            CreateRequest("from shell"),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal("Which merchant was this from?", firstResult.AssistantMessage);
        Assert.Null(firstResult.Transaction);

        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.NotNull(secondResult.Transaction);
        Assert.Equal(1, transactionService.SaveCount);
        Assert.Equal(250m, secondResult.Transaction!.Amount);
        Assert.Equal("petrol", secondResult.Transaction.Description);
        Assert.Equal("Shell", secondResult.Transaction.MerchantName);
        Assert.Equal("Fuel", secondResult.Transaction.CategoryName);
    }

    private static ExpenseInputProcessor CreateProcessor(
        bool requireMerchantForExpenses = false,
        FakeTransactionService? transactionService = null) =>
        new(
            new HeuristicExpenseInputParser(),
            new FakeAppUserProfileService(requireMerchantForExpenses),
            new InMemoryExpenseInputDraftStore(),
            transactionService ?? new FakeTransactionService());

    private static ExpenseInputParseRequest CreateRequest(string sourceText) =>
        new(
            sourceText,
            "local",
            "auth-subject",
            HouseholdId,
            InputMode.Text,
            DefaultTransactionDate,
            "INR",
            "en-IN",
            "test@example.com",
            "Test User");

    private sealed class FakeAppUserProfileService(
        bool requireMerchantForExpenses) : IAppUserProfileService
    {
        public Task<AppUserContext> ResolveAsync(
            AppUserIdentity identity,
            CancellationToken cancellationToken) =>
            Task.FromResult(new AppUserContext(
                UserProfileId,
                PersonalHouseholdId,
                identity.Email ?? "test@example.com",
                identity.DisplayName ?? "Test User",
                "INR",
                "Asia/Calcutta",
                UserPlan.Free,
                requireMerchantForExpenses,
                TransactionVisibility.Private));

        public async Task<UserSettingsModel> GetSettingsAsync(
            AppUserIdentity identity,
            CancellationToken cancellationToken)
        {
            var context = await ResolveAsync(identity, cancellationToken);
            return new UserSettingsModel(
                context.UserProfileId,
                context.Email,
                context.DisplayName,
                context.CurrencyCode,
                context.TimeZone,
                context.Plan,
                context.RequireMerchantForExpenses,
                context.DefaultTransactionVisibility);
        }

        public Task<UserSettingsModel> UpdateSettingsAsync(
            AppUserIdentity identity,
            UpdateUserSettingsCommand command,
            CancellationToken cancellationToken) =>
            GetSettingsAsync(identity, cancellationToken);
    }

    private sealed class FakeTransactionService : ITransactionService
    {
        public int SaveCount { get; private set; }

        public Task<TransactionModel> SaveExpenseAsync(
            SaveExpenseCommand command,
            CancellationToken cancellationToken)
        {
            SaveCount++;

            return Task.FromResult(new TransactionModel(
                Guid.NewGuid(),
                command.RequestedHouseholdId ?? command.UserContext.PersonalHouseholdId,
                command.UserContext.UserProfileId,
                command.Draft.Amount!.Value,
                command.UserContext.CurrencyCode,
                TransactionType.Expense,
                command.Draft.CategoryGuess,
                command.Draft.MerchantName,
                command.Draft.Description,
                command.Draft.SourceText,
                command.Draft.TransactionDate ?? DefaultTransactionDate,
                command.Draft.InputMode,
                command.Draft.Confidence,
                command.UserContext.DefaultTransactionVisibility,
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow,
                command.UserContext.DisplayName));
        }

        public Task<IReadOnlyCollection<TransactionModel>> ListAsync(
            AppUserContext userContext,
            Guid? householdId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<TransactionModel>>([]);

        public Task<TransactionModel?> GetAsync(
            AppUserContext userContext,
            Guid transactionId,
            CancellationToken cancellationToken) =>
            Task.FromResult<TransactionModel?>(null);

        public Task<TransactionModel?> UpdateAsync(
            AppUserContext userContext,
            Guid transactionId,
            UpdateTransactionCommand command,
            CancellationToken cancellationToken) =>
            Task.FromResult<TransactionModel?>(null);
    }
}
