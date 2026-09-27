using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class WrittenPaymentDateTests
{
    [Theory]
    [InlineData("Paid ₹10 at Sample Shop on 24th Sep 26", 2026, 9, 24)]
    [InlineData("Paid ₹10 at Sample Shop on 20 September 2026", 2026, 9, 20)]
    [InlineData("Paid ₹10 at Sample Shop on 3rd Jan 25", 2025, 1, 3)]
    public async Task ParsesWrittenPaymentDate(string text, int year, int month, int day)
    {
        var result = await new HeuristicExpenseInputParser().ParseAsync(
            new ExpenseInputParseRequest(text, "local", "test-user", null, InputMode.Image,
                null, "INR", "en-IN"), default);
        Assert.Equal(new DateOnly(year, month, day), result.Draft?.TransactionDate);
        Assert.Equal(10m, result.Draft?.Amount);
    }
}
