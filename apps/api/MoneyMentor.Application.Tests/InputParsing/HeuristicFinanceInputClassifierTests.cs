using MoneyMentor.Application.InputParsing;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class HeuristicFinanceInputClassifierTests
{
    private readonly HeuristicFinanceInputClassifier classifier = new();

    [Theory]
    [InlineData("where did I spend most this month?", FinanceInputIntent.AskFinanceQuestion)]
    [InlineData("how much did I spend on groceries this month?", FinanceInputIntent.AskFinanceQuestion)]
    [InlineData("ice cream from zepto", FinanceInputIntent.CreateExpense)]
    [InlineData("250", FinanceInputIntent.ClarificationResponse)]
    [InlineData("salary credited 50000", FinanceInputIntent.CreateIncome)]
    [InlineData("Joe sent me 300 Rs for chips", FinanceInputIntent.CreateIncome)]
    [InlineData("Rahul ne mujhe 500 chips ke liye diye", FinanceInputIntent.CreateIncome)]
    [InlineData("sent 70k to credit card", FinanceInputIntent.CreateExpense)]
    [InlineData("Credit card bill 70k", FinanceInputIntent.CreateExpense)]
    [InlineData("credit bill", FinanceInputIntent.CreateExpense)]
    [InlineData("credit card", FinanceInputIntent.CreateExpense)]
    [InlineData("paid 70k in credit card", FinanceInputIntent.CreateExpense)]
    [InlineData("I want to save 3 lakh in 8 months", FinanceInputIntent.AskGoalAdvice)]
    [InlineData("hello there", FinanceInputIntent.Unknown)]
    public async Task ClassifyAsync_ReturnsExpectedIntent(
        string sourceText,
        FinanceInputIntent expectedIntent)
    {
        var result = await classifier.ClassifyAsync(
            new FinanceInputClassificationRequest(
                sourceText,
                "local",
                "auth-subject",
                "en-IN"),
            CancellationToken.None);

        Assert.Equal(expectedIntent, result);
    }
}
