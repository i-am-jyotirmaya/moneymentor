using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Domain.Finance;
using Xunit;
namespace MoneyMentor.Application.Tests.Transactions;

public sealed class FinancialEventInputProcessorTests
{
    private readonly AppUserContext user = new(Guid.NewGuid(), Guid.NewGuid(), "test@example.test", "Test", "INR", "UTC", UserPlan.Premium, false, TransactionVisibility.Private);
    [Fact]
    public async Task A_credit_is_not_saved_until_the_user_clarifies_its_meaning()
    {
        var events = new RecordingEvents(user);
        var processor = Processor(events);
        var first = await processor.TryProcessAsync(Command("Amazon sent me 5000"), TestContext.Current.CancellationToken);
        Assert.Equal(AssistantMessageStatus.NeedsClarification, first!.Status); Assert.Null(events.Last);
        var second = await processor.TryProcessAsync(Command("refund"), TestContext.Current.CancellationToken);
        Assert.Equal(TransactionKind.Refund, events.Last!.EventKind); Assert.Equal(5000m, events.Last.Amount);
        Assert.Equal(AssistantMessageStatus.Responded, second!.Status);
    }
    [Fact]
    public async Task Card_alias_bill_payments_are_transfers_and_ordinary_expenses_are_not_intercepted()
    {
        var events = new RecordingEvents(user); var processor = Processor(events);
        var result = await processor.TryProcessAsync(Command("Paid Millennia bill 32,400 from HDFC"), TestContext.Current.CancellationToken);
        Assert.Equal(TransactionKind.CreditCardPayment, events.Last!.EventKind);
        Assert.Equal(32400m, events.Last.Amount); Assert.Equal("Millennia", events.Last.CounterpartyAccountAlias);
        Assert.Equal(AssistantMessageStatus.Responded, result!.Status);
        Assert.Null(await processor.TryProcessAsync(Command("500 groceries"), TestContext.Current.CancellationToken));
    }
    [Fact]
    public async Task Missing_amount_clarification_retains_the_original_event_and_source()
    {
        var events = new RecordingEvents(user); var processor = Processor(events);
        Assert.Equal(AssistantMessageStatus.NeedsClarification, (await processor.TryProcessAsync(Command("Amazon refunded headphones"), TestContext.Current.CancellationToken))!.Status);
        await processor.TryProcessAsync(Command("2300"), TestContext.Current.CancellationToken);
        Assert.Equal(TransactionKind.Refund, events.Last!.EventKind); Assert.Equal(2300m, events.Last.Amount);
        Assert.Contains("Amazon refunded", events.Last.SourceText);
    }
    [Fact]
    public async Task Selecting_an_ambiguous_purchase_retries_with_its_id()
    {
        var events = new RecordingEvents(user) { RequireMatch = true }; var processor = Processor(events);
        var first = await processor.TryProcessAsync(Command("Amazon refunded 2300 for headphones"), TestContext.Current.CancellationToken);
        Assert.Equal(AssistantMessageStatus.NeedsClarification, first!.Status);
        events.RequireMatch = false;
        var second = await processor.TryProcessAsync(Command("1"), TestContext.Current.CancellationToken);
        Assert.Equal(events.OriginalId, events.Last!.RelatedTransactionId); Assert.Equal(2300m, events.Last.Amount);
        Assert.Equal(AssistantMessageStatus.Responded, second!.Status);
    }
    private FinancialEventInputProcessor Processor(RecordingEvents events) => new(events, new Profiles(user), new(TimeProvider.System), TimeProvider.System, new Accounts());
    private AssistantMessageCommand Command(string text) => new(text, "test", user.UserProfileId.ToString(), user.PersonalHouseholdId, InputMode.Text, new(2026, 6, 1), "INR", "en-IN", user.Email, user.DisplayName);
    private sealed class Profiles(AppUserContext user) : IAppUserProfileService
    {
        public Task<AppUserContext> ResolveAsync(AppUserIdentity id, CancellationToken ct) => Task.FromResult(user);
        public Task<UserSettingsModel> GetSettingsAsync(AppUserIdentity id, CancellationToken ct) => throw new NotSupportedException();
        public Task<UserSettingsModel> UpdateSettingsAsync(AppUserIdentity id, UpdateUserSettingsCommand command, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class Accounts : IFinancialAccountService
    {
        public Task<IReadOnlyCollection<FinancialAccountModel>> ListAsync(AppUserContext user, Guid? householdId, CancellationToken ct) => Task.FromResult<IReadOnlyCollection<FinancialAccountModel>>([
            new(Guid.NewGuid(), user.PersonalHouseholdId, user.UserProfileId, "HDFC Millennia", FinancialAccountType.CreditCard, "HDFC", null, "INR", true, ["Millennia"])]);
        public Task<FinancialAccountModel> SaveAsync(AppUserContext user, Guid? id, SaveFinancialAccountCommand command, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class RecordingEvents(AppUserContext user) : IFinancialEventService
    {
        public TransactionIntent? Last { get; private set; }
        public bool RequireMatch { get; set; }
        public Guid OriginalId { get; } = Guid.NewGuid();
        public Task<TransactionModel> SaveAsync(AppUserContext context, TransactionIntent intent, CancellationToken ct)
        {
            Last = intent;
            if (RequireMatch) throw new TransactionMatchRequiredException([new(OriginalId, 2300, new(2026, 5, 1), "Amazon", "headphones")]);
            return Task.FromResult(new TransactionModel(Guid.NewGuid(), user.PersonalHouseholdId, user.UserProfileId, intent.Amount, "INR",
                TransactionFinancialImpactCalculator.TypeFor(intent.EventKind), null, intent.Merchant, intent.Description, intent.SourceText,
                intent.Date ?? new(2026, 6, 1), InputMode.Text, 1, TransactionVisibility.Private, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "Test") { Kind = intent.EventKind });
        }
    }
}
