using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.InputParsing;

public sealed class ExpenseInputProcessorTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly DateOnly DefaultTransactionDate = new(2026, 6, 24);

    private readonly ExpenseInputProcessor processor = new(
        new HeuristicExpenseInputParser(),
        new InMemoryExpenseInputDraftStore());

    [Fact]
    public async Task ProcessAsync_CompletesExpense_WhenAmountIsProvidedBeforeDescription()
    {
        var firstResult = await processor.ProcessAsync(CreateRequest("100"), CancellationToken.None);
        var secondResult = await processor.ProcessAsync(CreateRequest("breakfast"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal("What was this expense for?", firstResult.AssistantMessage);

        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.Equal(FinanceInputIntent.CreateExpense, secondResult.Intent);
        Assert.NotNull(secondResult.Draft);

        var draft = secondResult.Draft!;
        Assert.Equal(100m, draft.Amount);
        Assert.Equal("Dining", draft.CategoryGuess);
        Assert.Equal("breakfast", draft.Description);
        Assert.DoesNotContain(ExpenseDraftMissingField.Amount, draft.MissingFields);
        Assert.DoesNotContain(ExpenseDraftMissingField.Category, draft.MissingFields);
        Assert.DoesNotContain(ExpenseDraftMissingField.Description, draft.MissingFields);
        Assert.Equal(
            "I parsed INR 100 for breakfast under Dining. This is only a draft for now, not saved yet.",
            secondResult.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_CompletesExpense_WhenDescriptionIsProvidedBeforeAmount()
    {
        var firstResult = await processor.ProcessAsync(CreateRequest("breakfast"), CancellationToken.None);
        var secondResult = await processor.ProcessAsync(CreateRequest("100"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal("How much did you spend on breakfast?", firstResult.AssistantMessage);

        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.Equal(FinanceInputIntent.CreateExpense, secondResult.Intent);
        Assert.NotNull(secondResult.Draft);

        var draft = secondResult.Draft!;
        Assert.Equal(100m, draft.Amount);
        Assert.Equal("Dining", draft.CategoryGuess);
        Assert.Equal("breakfast", draft.Description);
        Assert.Equal(
            "I parsed INR 100 for breakfast under Dining. This is only a draft for now, not saved yet.",
            secondResult.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_ClearsPendingDraft_AfterClarificationCompletes()
    {
        await processor.ProcessAsync(CreateRequest("breakfast"), CancellationToken.None);
        var completedResult = await processor.ProcessAsync(CreateRequest("100"), CancellationToken.None);
        var newAmountOnlyResult = await processor.ProcessAsync(CreateRequest("100"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, completedResult.Status);
        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, newAmountOnlyResult.Status);
        Assert.Equal("What was this expense for?", newAmountOnlyResult.AssistantMessage);

        Assert.NotNull(newAmountOnlyResult.Draft);
        Assert.Equal(100m, newAmountOnlyResult.Draft!.Amount);
        Assert.Null(newAmountOnlyResult.Draft.Description);
    }

    [Fact]
    public async Task ProcessAsync_UsesCompleteCurrentExpense_WhenPendingDraftExists()
    {
        await processor.ProcessAsync(CreateRequest("breakfast"), CancellationToken.None);
        var result = await processor.ProcessAsync(CreateRequest("petrol 250"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.Parsed, result.Status);
        Assert.NotNull(result.Draft);
        Assert.Equal(250m, result.Draft!.Amount);
        Assert.Equal("Fuel", result.Draft.CategoryGuess);
        Assert.Equal("petrol", result.Draft.Description);
    }

    [Fact]
    public async Task ProcessAsync_CleansAcquisitionFillerWords_WhenCompletingProductExpense()
    {
        var firstResult = await processor.ProcessAsync(
            CreateRequest("I got a under desk cable management tray"),
            CancellationToken.None);
        var secondResult = await processor.ProcessAsync(CreateRequest("900"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal(
            "How much did you spend on under desk cable management tray?",
            firstResult.AssistantMessage);

        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.NotNull(secondResult.Draft);

        var draft = secondResult.Draft!;
        Assert.Equal(900m, draft.Amount);
        Assert.Equal("Household", draft.CategoryGuess);
        Assert.Equal("under desk cable management tray", draft.Description);
        Assert.Equal(
            "I parsed INR 900 for under desk cable management tray under Household. This is only a draft for now, not saved yet.",
            secondResult.AssistantMessage);
    }

    [Fact]
    public async Task ProcessAsync_CleansOrderVerb_WhenCompletingFoodDeliveryExpense()
    {
        var firstResult = await processor.ProcessAsync(
            CreateRequest("Order food from Zomato."),
            CancellationToken.None);
        var secondResult = await processor.ProcessAsync(CreateRequest("100"), CancellationToken.None);

        Assert.Equal(ExpenseInputParseStatus.NeedsClarification, firstResult.Status);
        Assert.Equal("How much did you spend on food?", firstResult.AssistantMessage);

        Assert.Equal(ExpenseInputParseStatus.Parsed, secondResult.Status);
        Assert.NotNull(secondResult.Draft);

        var draft = secondResult.Draft!;
        Assert.Equal(100m, draft.Amount);
        Assert.Equal("Food Delivery", draft.CategoryGuess);
        Assert.Equal("Zomato", draft.MerchantName);
        Assert.Equal("food", draft.Description);
        Assert.Equal(
            "I parsed INR 100 for food from Zomato under Food Delivery. This is only a draft for now, not saved yet.",
            secondResult.AssistantMessage);
    }

    private static ExpenseInputParseRequest CreateRequest(string sourceText) =>
        new(
            sourceText,
            "local",
            "auth-subject",
            HouseholdId,
            InputMode.Text,
            DefaultTransactionDate,
            "INR",
            "en-IN");
}
