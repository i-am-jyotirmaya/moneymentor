using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Domain.Finance;
using Xunit;
namespace MoneyMentor.Application.Tests.Transactions;

public sealed class FinancialSemanticsTests
{
    [Theory]
    [InlineData(TransactionKind.Purchase, 100, 0, 0, 0)]
    [InlineData(TransactionKind.Refund, -100, 0, 0, 0)]
    [InlineData(TransactionKind.Income, 0, 100, 0, 0)]
    [InlineData(TransactionKind.Transfer, 0, 0, 0, 0)]
    [InlineData(TransactionKind.CreditCardPayment, 0, 0, 0, 0)]
    [InlineData(TransactionKind.CashWithdrawal, 0, 0, 0, 0)]
    [InlineData(TransactionKind.Fee, 100, 0, 0, 0)]
    [InlineData(TransactionKind.Interest, 100, 0, 0, 0)]
    [InlineData(TransactionKind.Cashback, 0, 0, 0, 100)]
    [InlineData(TransactionKind.Investment, 0, 0, 100, 0)]
    public void Event_kind_assigns_impact_independently_of_legacy_type(TransactionKind kind, decimal spend, decimal income, decimal investment, decimal rewards)
    {
        var actual = TransactionFinancialImpactCalculator.Calculate(100, TransactionType.Expense, kind);
        Assert.Equal(new TransactionFinancialImpact(spend, income, investment, rewards), actual);
    }

    [Theory]
    [InlineData(TransactionKind.Purchase, -100, 0)]
    [InlineData(TransactionKind.Income, 0, -100)]
    [InlineData(TransactionKind.Refund, 100, 0)]
    [InlineData(TransactionKind.CreditCardPayment, 0, 0)]
    public void Reversal_inverts_original_kind(TransactionKind originalKind, decimal spend, decimal income)
    {
        var actual = TransactionFinancialImpactCalculator.Calculate(100, TransactionType.Transfer, TransactionKind.Reversal, originalKind);
        Assert.Equal(spend, actual.Spending); Assert.Equal(income, actual.Income);
    }
    [Fact]
    public void Reversals_without_original_semantics_are_rejected() => Assert.Throws<InvalidOperationException>(() =>
        TransactionFinancialImpactCalculator.Calculate(100, TransactionType.Transfer, TransactionKind.Reversal));

    [Fact]
    public void Card_purchases_settlement_partial_refunds_and_fees_produce_net_consumption()
    {
        var user = new AppUserContext(Guid.NewGuid(), Guid.NewGuid(), "test@example.test", "Test", "INR", "UTC", UserPlan.Premium, false, TransactionVisibility.Private);
        TransactionModel Event(TransactionKind kind, decimal amount, string category) => new(Guid.NewGuid(), user.PersonalHouseholdId,
            user.UserProfileId, amount, "INR", TransactionFinancialImpactCalculator.TypeFor(kind), category, "Amazon", category,
            "test", new DateOnly(2026, 6, 1), InputMode.Text, 1m, TransactionVisibility.Private, DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow, "Test") { Kind = kind, PaymentChannel = PaymentChannel.Card };
        var dashboard = new MonthlyDashboardBuilder().Build(user, new(2026, 6, 1), [
            Event(TransactionKind.Purchase, 2000, "Dining"), Event(TransactionKind.Purchase, 5000, "Shopping"),
            Event(TransactionKind.CreditCardPayment, 7000, "Shopping"), Event(TransactionKind.Refund, 1500, "Shopping"),
            Event(TransactionKind.Refund, 500, "Shopping"), Event(TransactionKind.Transfer, 25000, "Shopping"),
            Event(TransactionKind.CashWithdrawal, 5000, "Shopping"), Event(TransactionKind.Cashback, 100, "Rewards"),
            Event(TransactionKind.Fee, 200, "Financial charges"), Event(TransactionKind.Interest, 300, "Financial charges"),
            Event(TransactionKind.Income, 10000, "Salary")], 6);
        Assert.Equal(5500m, dashboard.Spends); Assert.Equal(10000m, dashboard.Income);
        Assert.Equal(3000m, dashboard.Categories.Single(x => x.Name == "Shopping").Amount);
        Assert.Equal(4500m, dashboard.Saved);
        Assert.DoesNotContain(dashboard.Categories, x => x.Name == "Rewards");
    }
    [Theory]
    [InlineData(TransactionType.Expense, 100, 0)]
    [InlineData(TransactionType.Income, 0, 100)]
    [InlineData(TransactionType.Transfer, 0, 0)]
    public void Historical_accountless_events_keep_their_meaning(TransactionType type, decimal spending, decimal income)
    {
        var actual = TransactionFinancialImpactCalculator.Calculate(100, type);
        Assert.Equal(spending, actual.Spending); Assert.Equal(income, actual.Income);
    }

    [Theory]
    [InlineData("Amazon refunded 2300 for the headphones", TransactionKind.Refund)]
    [InlineData("Paid my credit card bill of 32400 from HDFC", TransactionKind.CreditCardPayment)]
    [InlineData("Moved 20k from HDFC to ICICI", TransactionKind.Transfer)]
    [InlineData("Withdraw 5000 from ATM", TransactionKind.CashWithdrawal)]
    [InlineData("Card annual fee 500", TransactionKind.Fee)]
    [InlineData("Card interest 1200", TransactionKind.Interest)]
    [InlineData("Cashback 100 from Amazon", TransactionKind.Cashback)]
    public void Normalized_financial_text_identifies_event_kind(string text, TransactionKind kind) => Assert.Equal(kind, FinancialEventInterpreter.DetectKind(text));

    [Theory]
    [InlineData("Spent 500 on groceries")]
    [InlineData("450 lunch")]
    [InlineData("How much did Amazon refund last month?")]
    [InlineData("Show credit card bill payments")]
    public void Ordinary_purchases_and_queries_remain_in_the_existing_input_flow(string text) => Assert.Null(FinancialEventInterpreter.DetectKind(text));

    [Fact]
    public void Amount_account_channel_and_kind_are_separate()
    {
        var purchase = FinancialEventInterpreter.AddMetadata(new(TransactionKind.Purchase, 2800), "Paid 2800 for dinner at Antera on my Millennia card");
        Assert.Equal("Millennia", purchase.AccountAlias); Assert.Equal(PaymentChannel.Card, purchase.PaymentChannel);
        var payment = FinancialEventInterpreter.AddMetadata(new(TransactionKind.CreditCardPayment, 32400), "Paid Millennia bill 32,400 from HDFC");
        Assert.Equal("HDFC", payment.AccountAlias); Assert.Equal("Millennia", payment.CounterpartyAccountAlias);
        var groceries = FinancialEventInterpreter.AddMetadata(new(TransactionKind.Purchase, 500), "Spent 500 on groceries");
        Assert.Null(groceries.AccountAlias);
    }
    [Fact]
    public void An_unspecified_credit_requires_financial_meaning() => Assert.True(FinancialEventInterpreter.IsAmbiguousCredit("Amazon sent me 5000"));

    [Theory]
    [InlineData("bought potatoes for rs 40 using kotak upi", "potatoes using kotak upi", "potatoes", "kotak", PaymentChannel.UPI)]
    [InlineData("Paid 2800 for dinner on my Millennia card", "dinner Millennia card", "dinner", "Millennia", PaymentChannel.Card)]
    [InlineData("Bought groceries using Kotak UPI for 40", "groceries using Kotak UPI", "groceries", "Kotak", PaymentChannel.UPI)]
    public void Payment_metadata_does_not_become_the_purchase_description(string source, string parsedDescription,
        string purpose, string account, PaymentChannel channel)
    {
        var intent = FinancialEventInterpreter.AddMetadata(new(TransactionKind.Purchase, 40) { Description = parsedDescription, SourceText = source }, source);
        Assert.Equal(purpose, intent.Description); Assert.Equal(account, intent.AccountAlias);
        Assert.Equal(channel, intent.PaymentChannel); Assert.Equal(source, intent.SourceText);
    }
}
