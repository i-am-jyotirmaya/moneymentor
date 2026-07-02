using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class IncomeInputProcessorTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserProfileId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly DateOnly TransactionDate = new(2026, 7, 2);

    [Fact]
    public async Task ProcessAsync_SavesIncome_WithSenderAndReason()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService);

        var result = await processor.ProcessAsync(
            CreateRequest("Joe sent me 300 Rs for chips"),
            CancellationToken.None);

        Assert.Equal(IncomeInputParseStatus.Parsed, result.Status);
        Assert.Equal(FinanceInputIntent.CreateIncome, result.Intent);
        Assert.Equal(1, transactionService.SaveIncomeCount);
        Assert.NotNull(result.Transaction);
        Assert.Equal(TransactionType.Income, result.Transaction!.Type);
        Assert.Equal("Joe", result.Transaction.SenderName);
        Assert.Equal("chips", result.Transaction.Reason);
        Assert.Null(result.Transaction.MerchantName);
        Assert.Null(result.Transaction.Description);
        Assert.Equal("Tracked ₹300 received from Joe for chips.", result.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_MergesFormattedAmountIntoPendingSalary()
    {
        var transactionService = new FakeTransactionService();
        var processor = CreateProcessor(transactionService);

        var firstResult = await processor.ProcessAsync(
            CreateRequest("Got my salary."),
            CancellationToken.None);
        Assert.True(processor.HasPendingDraft(CreateRequest("₹2,00,000.")));

        var secondResult = await processor.ProcessAsync(
            CreateRequest("₹2,00,000."),
            CancellationToken.None);

        Assert.Equal(IncomeInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal(IncomeInputParseStatus.Parsed, secondResult.Status);
        Assert.Equal(1, transactionService.SaveIncomeCount);
        Assert.Equal(200000m, secondResult.Transaction!.Amount);
        Assert.Equal("Salary", secondResult.Transaction.Reason);
        Assert.Equal("Tracked ₹200000 received for Salary.", secondResult.AssistantMessage);
        Assert.False(processor.HasPendingDraft(CreateRequest("unused")));
    }

    private static IncomeInputProcessor CreateProcessor(FakeTransactionService transactionService) =>
        new(
            new HeuristicIncomeInputParser(),
            new FakeAppUserProfileService(),
            new InMemoryIncomeInputDraftStore(),
            transactionService);

    private static IncomeInputParseRequest CreateRequest(string sourceText) =>
        new(
            sourceText,
            "local",
            "auth-subject",
            HouseholdId,
            InputMode.Text,
            TransactionDate,
            "INR",
            "en-IN",
            "test@example.com",
            "Test User");

    private sealed class FakeAppUserProfileService : IAppUserProfileService
    {
        public Task<AppUserContext> ResolveAsync(
            AppUserIdentity identity,
            CancellationToken cancellationToken) =>
            Task.FromResult(new AppUserContext(
                UserProfileId,
                HouseholdId,
                identity.Email ?? "test@example.com",
                identity.DisplayName ?? "Test User",
                "INR",
                "Asia/Calcutta",
                UserPlan.Free,
                false,
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
        public int SaveIncomeCount { get; private set; }

        public Task<TransactionModel> SaveExpenseAsync(
            SaveExpenseCommand command,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task<TransactionModel> SaveIncomeAsync(
            SaveIncomeCommand command,
            CancellationToken cancellationToken)
        {
            SaveIncomeCount++;
            return Task.FromResult(new TransactionModel(
                Guid.NewGuid(),
                command.RequestedHouseholdId ?? command.UserContext.PersonalHouseholdId,
                command.UserContext.UserProfileId,
                command.Draft.Amount!.Value,
                command.UserContext.CurrencyCode,
                TransactionType.Income,
                command.Draft.Reason == "Salary" ? "Salary" : "Other Income",
                null,
                null,
                command.Draft.SourceText,
                command.Draft.TransactionDate ?? TransactionDate,
                command.Draft.InputMode,
                command.Draft.Confidence,
                command.UserContext.DefaultTransactionVisibility,
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow,
                command.UserContext.DisplayName)
            {
                SenderName = command.Draft.SenderName,
                Reason = command.Draft.Reason
            });
        }

        public Task<TransactionPageModel> ListAsync(
            AppUserContext userContext,
            TransactionPageQuery query,
            CancellationToken cancellationToken) =>
            Task.FromResult(new TransactionPageModel([], query.Page, query.PageSize, 0, 0));

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
