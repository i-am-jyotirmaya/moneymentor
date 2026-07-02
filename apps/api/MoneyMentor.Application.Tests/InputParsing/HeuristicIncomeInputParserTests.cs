using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class HeuristicIncomeInputParserTests
{
    private readonly HeuristicIncomeInputParser parser = new();

    [Theory]
    [InlineData("Joe sent me 300 Rs for chips", 300, "Joe", "chips")]
    [InlineData("received 1250 from Priya for groceries", 1250, "Priya", "groceries")]
    [InlineData("he gave me 450 for dinner", 450, "He", "dinner")]
    [InlineData("Rahul ne mujhe 500 chips ke liye diye", 500, "Rahul", "chips")]
    public async Task ParseAsync_ExtractsAmountSenderAndReason(
        string sourceText,
        decimal expectedAmount,
        string expectedSender,
        string expectedReason)
    {
        var result = await parser.ParseAsync(CreateRequest(sourceText), CancellationToken.None);

        Assert.Equal(IncomeInputParseStatus.Parsed, result.Status);
        Assert.Equal(FinanceInputIntent.CreateIncome, result.Intent);
        var draft = Assert.IsType<IncomeDraft>(result.Draft);
        Assert.Equal(expectedAmount, draft.Amount);
        Assert.Equal(expectedSender, draft.SenderName);
        Assert.Equal(expectedReason, draft.Reason);
        Assert.DoesNotContain(IncomeDraftMissingField.Amount, draft.MissingFields);
        Assert.True(draft.Confidence >= 0.8m);
    }

    [Fact]
    public async Task ParseAsync_AsksForAmount_WhenSalaryHasNoAmount()
    {
        var result = await parser.ParseAsync(
            CreateRequest("got my salary"),
            CancellationToken.None);

        Assert.Equal(IncomeInputParseStatus.NeedsClarification, result.Status);
        Assert.Equal(FinanceInputIntent.ClarificationResponse, result.Intent);
        var draft = Assert.IsType<IncomeDraft>(result.Draft);
        Assert.Null(draft.Amount);
        Assert.Null(draft.SenderName);
        Assert.Equal("Salary", draft.Reason);
        Assert.Contains(IncomeDraftMissingField.Amount, draft.MissingFields);
        Assert.Equal("How much did you receive for Salary?", result.AssistantMessage);
    }

    [Theory]
    [InlineData("sent 70k to credit card")]
    [InlineData("Credit card bill 70k")]
    [InlineData("credit bill")]
    [InlineData("credit card")]
    [InlineData("paid 70k in credit card")]
    public async Task ParseAsync_RejectsCreditCardPaymentsAsIncome(string sourceText)
    {
        var result = await parser.ParseAsync(CreateRequest(sourceText), CancellationToken.None);

        Assert.Equal(IncomeInputParseStatus.Unsupported, result.Status);
        Assert.Null(result.Draft);
        Assert.Contains("expense", result.AssistantMessage, StringComparison.OrdinalIgnoreCase);
    }

    private static IncomeInputParseRequest CreateRequest(string sourceText) =>
        new(
            sourceText,
            "local",
            "auth-subject",
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            InputMode.Text,
            new DateOnly(2026, 7, 2),
            "INR",
            "en-IN");
}
