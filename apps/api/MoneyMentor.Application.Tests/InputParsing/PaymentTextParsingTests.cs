using MoneyMentor.Application.InputParsing;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class PaymentTextParsingTests
{
    [Theory]
    [InlineData("Available balance ₹1900\nYou paid ₹500\nCashback ₹25", 500)]
    [InlineData("Available balance\n₹1900\nYou paid\n₹500\nCashback\n₹25", 500)]
    [InlineData("Payment successful\n₹649.00\n20 Sep 2026, 8:43 PM\nUPI transaction ID\n625163091872", 649)]
    [InlineData("credit card bill 70k", 70000)]
    [InlineData("Received ₹2000 from Joe\nAvailable balance ₹20000", 2000)]
    public void ChoosesTransactionAmount(string text, decimal amount) => Assert.Equal(amount, FinanceAmountExtractor.Extract(text)?.Amount);

    [Theory]
    [InlineData("Reliance\n₹850\n₹350")]
    [InlineData("Available balance ₹1900\nCashback ₹25")]
    [InlineData("Transaction ID 625163091872\n20 Sep 2026, 8:43 PM")]
    public void DoesNotGuessAnAmbiguousOrNonTransactionAmount(string text) => Assert.Null(FinanceAmountExtractor.Extract(text));
}
