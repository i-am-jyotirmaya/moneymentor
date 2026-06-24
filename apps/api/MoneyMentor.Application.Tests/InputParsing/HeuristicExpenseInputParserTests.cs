using System.Globalization;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class HeuristicExpenseInputParserTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly DateOnly DefaultTransactionDate = new(2026, 6, 11);

    private readonly HeuristicExpenseInputParser parser = new();

    [Theory]
    [InlineData("groceries for 110 from local market", "110", "Groceries", "Local Market", "groceries")]
    [InlineData("petrol 250", "250", "Fuel", null, "petrol")]
    [InlineData("paid rent 18000", "18000", "Rent", null, "rent")]
    [InlineData("protein powder 2400 from amazon", "2400", "Fitness", "Amazon", "protein powder")]
    [InlineData("sabzi 80", "80", "Groceries", null, "sabzi")]
    [InlineData("doodh 60", "60", "Groceries", null, "doodh")]
    [InlineData("swiggy dinner 540", "540", "Food Delivery", "Swiggy", "dinner")]
    [InlineData("zepto ice cream 180", "180", "Snacks", "Zepto", "ice cream")]
    [InlineData("paid rent 18k", "18000", "Rent", null, "rent")]
    public async Task ParseAsync_ParsesCommonExpenseInputs(
        string sourceText,
        string expectedAmount,
        string expectedCategory,
        string? expectedMerchant,
        string expectedDescription)
    {
        var result = await parser.ParseAsync(CreateRequest(sourceText), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, result.Status);
        Assert.Equal(FinanceInputIntent.CreateExpense, result.Intent);
        Assert.Empty(result.Errors);
        Assert.Null(result.AssistantMessage);

        Assert.NotNull(result.Draft);
        var draft = result.Draft!;

        Assert.Equal(decimal.Parse(expectedAmount, CultureInfo.InvariantCulture), draft.Amount);
        Assert.Equal(expectedCategory, draft.CategoryGuess);
        Assert.Equal(expectedMerchant, draft.MerchantName);
        Assert.Equal(expectedDescription, draft.Description);
        Assert.Equal(sourceText, draft.SourceText);
        Assert.Equal(InputMode.Text, draft.InputMode);
        Assert.Equal(DefaultTransactionDate, draft.TransactionDate);
        Assert.True(draft.Confidence > 0.5m);
        Assert.DoesNotContain(ExpenseDraftMissingField.Amount, draft.MissingFields);
        Assert.DoesNotContain(ExpenseDraftMissingField.Category, draft.MissingFields);
        Assert.DoesNotContain(ExpenseDraftMissingField.Description, draft.MissingFields);
        Assert.DoesNotContain(ExpenseDraftMissingField.TransactionDate, draft.MissingFields);
        Assert.DoesNotContain(ExpenseDraftMissingField.Household, draft.MissingFields);
    }

    [Fact]
    public async Task ParseAsync_ReturnsClarification_WhenAmountIsMissing()
    {
        var result = await parser.ParseAsync(CreateRequest("ice cream from zepto"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, result.Status);
        Assert.Equal(FinanceInputIntent.ClarificationResponse, result.Intent);
        Assert.Equal("How much did you spend on ice cream?", result.AssistantMessage);
        Assert.Empty(result.Errors);

        Assert.NotNull(result.Draft);
        var draft = result.Draft!;

        Assert.Null(draft.Amount);
        Assert.Equal("Snacks", draft.CategoryGuess);
        Assert.Equal("Zepto", draft.MerchantName);
        Assert.Equal("ice cream", draft.Description);
        Assert.Contains(ExpenseDraftMissingField.Amount, draft.MissingFields);
    }

    [Fact]
    public async Task ParseAsync_AsksWhatExpenseWasFor_WhenOnlyAmountIsPresent()
    {
        var result = await parser.ParseAsync(CreateRequest("250"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, result.Status);
        Assert.Equal(FinanceInputIntent.ClarificationResponse, result.Intent);
        Assert.Equal("What was this expense for?", result.AssistantMessage);

        Assert.NotNull(result.Draft);
        var draft = result.Draft!;

        Assert.Equal(250m, draft.Amount);
        Assert.Null(draft.CategoryGuess);
        Assert.Null(draft.MerchantName);
        Assert.Null(draft.Description);
        Assert.Contains(ExpenseDraftMissingField.Category, draft.MissingFields);
        Assert.Contains(ExpenseDraftMissingField.Merchant, draft.MissingFields);
        Assert.Contains(ExpenseDraftMissingField.Description, draft.MissingFields);
    }

    [Theory]
    [InlineData("how much did I spend on groceries this month?", "This looks like a finance question rather than a new expense.")]
    [InlineData("salary credited 50000", "This input does not look like an expense.")]
    [InlineData("I want to save 3 lakh in 8 months", "This input does not look like an expense.")]
    public async Task ParseAsync_ReturnsUnsupported_ForNonExpenseInputs(
        string sourceText,
        string expectedMessage)
    {
        var result = await parser.ParseAsync(CreateRequest(sourceText), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Unsupported, result.Status);
        Assert.Equal(FinanceInputIntent.Unknown, result.Intent);
        Assert.Null(result.Draft);
        Assert.Equal(expectedMessage, result.AssistantMessage);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public async Task ParseAsync_UsesRelativeDate_WhenProvidedInInput()
    {
        var expectedDate = DateOnly.FromDateTime(DateTimeOffset.Now.Date).AddDays(-1);
        var result = await parser.ParseAsync(
            CreateRequest("petrol 250 yesterday", transactionDate: null),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, result.Status);
        Assert.NotNull(result.Draft);
        Assert.Equal(expectedDate, result.Draft!.TransactionDate);
    }

    [Fact]
    public async Task ParseAsync_RecordsMissingHousehold_WhenRequestHasNoHousehold()
    {
        var result = await parser.ParseAsync(
            CreateRequest("sabzi 80", includeHousehold: false),
            CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, result.Status);
        Assert.NotNull(result.Draft);
        Assert.Contains(ExpenseDraftMissingField.Household, result.Draft!.MissingFields);
    }

    private static ExpenseInputParseRequest CreateRequest(
        string sourceText,
        Guid? householdId = null,
        bool includeHousehold = true,
        DateOnly? transactionDate = null) =>
        new(
            sourceText,
            "local",
            "auth-subject",
            includeHousehold ? householdId ?? HouseholdId : null,
            InputMode.Text,
            transactionDate ?? DefaultTransactionDate,
            "INR",
            "en-IN");
}
