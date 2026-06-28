using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Finance;

public sealed class FinanceQuestionServiceTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherHouseholdId = Guid.Parse("11111111-1111-1111-1111-222222222222");
    private static readonly Guid UserProfileId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid OtherUserProfileId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public async Task AnswerAsync_ReturnsTopCategoryAnswer()
    {
        var service = CreateService([
            CreateTransaction(TransactionType.Expense, 500m, "Groceries", UserProfileId, HouseholdId),
            CreateTransaction(TransactionType.Expense, 300m, "Food Delivery", UserProfileId, HouseholdId)
        ]);

        var answer = await service.AnswerAsync(
            CreateContext(),
            CreateRequest("where did I spend most this month?"),
            CancellationToken.None);

        Assert.Equal(FinanceQuestionKind.TopSpendingCategory, answer.Kind);
        Assert.Equal("Groceries", answer.CategoryName);
        Assert.Equal(500m, answer.Amount);
        Assert.Contains("USD 500", answer.Answer);
    }

    [Fact]
    public async Task AnswerAsync_ReturnsCategoryTotalAnswer()
    {
        var service = CreateService([
            CreateTransaction(TransactionType.Expense, 250m, "Food Delivery", UserProfileId, HouseholdId),
            CreateTransaction(TransactionType.Expense, 125m, "Food Delivery", UserProfileId, HouseholdId)
        ]);

        var answer = await service.AnswerAsync(
            CreateContext(),
            CreateRequest("how much did I spend on food delivery this month?"),
            CancellationToken.None);

        Assert.Equal(FinanceQuestionKind.CategorySpendTotal, answer.Kind);
        Assert.Equal("Food Delivery", answer.CategoryName);
        Assert.Equal(375m, answer.Amount);
        Assert.Contains("USD 375", answer.Answer);
    }

    [Fact]
    public async Task AnswerAsync_ReturnsNoDataAnswer_WhenMonthHasNoExpenses()
    {
        var service = CreateService([]);

        var answer = await service.AnswerAsync(
            CreateContext(),
            CreateRequest("where did I spend most this month?"),
            CancellationToken.None);

        Assert.Equal(FinanceQuestionKind.TopSpendingCategory, answer.Kind);
        Assert.Null(answer.Amount);
        Assert.Contains("do not see any tracked expenses", answer.Answer);
    }

    [Fact]
    public async Task AnswerAsync_ReturnsUnknownAnswer_ForUnsupportedFinanceQuestion()
    {
        var service = CreateService([]);

        var answer = await service.AnswerAsync(
            CreateContext(),
            CreateRequest("can I buy a car?"),
            CancellationToken.None);

        Assert.Equal(FinanceQuestionKind.Unknown, answer.Kind);
        Assert.Contains("where you spent most", answer.Answer);
    }

    [Fact]
    public async Task AnswerAsync_UsesOnlyVisibleTransactionsForRequestedHousehold()
    {
        var service = CreateService([
            CreateTransaction(TransactionType.Expense, 500m, "Groceries", UserProfileId, HouseholdId),
            CreateTransaction(
                TransactionType.Expense,
                900m,
                "Private Other",
                OtherUserProfileId,
                HouseholdId,
                TransactionVisibility.Private),
            CreateTransaction(TransactionType.Expense, 700m, "Other Household", UserProfileId, OtherHouseholdId)
        ]);

        var answer = await service.AnswerAsync(
            CreateContext(),
            CreateRequest("where did I spend most this month?", HouseholdId),
            CancellationToken.None);

        Assert.Equal("Groceries", answer.CategoryName);
        Assert.Equal(500m, answer.Amount);
    }

    private static FinanceQuestionService CreateService(
        IReadOnlyCollection<TransactionModel> transactions)
    {
        var dashboardService = new MonthlyDashboardService(
            new FakeFinanceTransactionReader(transactions),
            new MonthlyDashboardBuilder());

        return new FinanceQuestionService(
            dashboardService,
            new FinanceQuestionParser());
    }

    private static FinanceQuestionRequest CreateRequest(
        string text,
        Guid? householdId = null) =>
        new(
            text,
            householdId,
            new DateOnly(2026, 6, 20),
            "en-IN");

    private static AppUserContext CreateContext() =>
        new(
            UserProfileId,
            HouseholdId,
            "test@example.com",
            "Test User",
            "USD",
            "Asia/Calcutta",
            UserPlan.Premium,
            false,
            TransactionVisibility.Private);

    private static TransactionModel CreateTransaction(
        TransactionType type,
        decimal amount,
        string categoryName,
        Guid userProfileId,
        Guid householdId,
        TransactionVisibility? visibility = null) =>
        new(
            Guid.NewGuid(),
            householdId,
            userProfileId,
            amount,
            "USD",
            type,
            categoryName,
            null,
            categoryName,
            categoryName,
            new DateOnly(2026, 6, 10),
            InputMode.Text,
            0.9m,
            visibility ?? (userProfileId == UserProfileId
                ? TransactionVisibility.Private
                : TransactionVisibility.Household),
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow,
            "Test User");

    private sealed class FakeFinanceTransactionReader(
        IReadOnlyCollection<TransactionModel> transactions) : IFinanceTransactionReader
    {
        public Task<IReadOnlyCollection<TransactionModel>> ListMonthlyTransactionsAsync(
            AppUserContext userContext,
            Guid? householdId,
            DateOnly month,
            CancellationToken cancellationToken)
        {
            var periodStart = new DateOnly(month.Year, month.Month, 1);
            var periodEnd = periodStart.AddMonths(1);

            var visibleTransactions = transactions
                .Where(transaction => transaction.TransactionDate >= periodStart
                    && transaction.TransactionDate < periodEnd
                    && (householdId is null || transaction.HouseholdId == householdId)
                    && (transaction.UserProfileId == userContext.UserProfileId
                        || transaction.Visibility == TransactionVisibility.Household))
                .ToArray();

            return Task.FromResult<IReadOnlyCollection<TransactionModel>>(visibleTransactions);
        }
    }
}
