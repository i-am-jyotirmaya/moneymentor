using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Dashboard;

public sealed class MonthlyDashboardBuilderTests
{
    private static readonly Guid HouseholdId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid UserProfileId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private readonly MonthlyDashboardBuilder builder = new();

    [Fact]
    public void Build_ComputesMonthlyTotalsAndCategorySummaries()
    {
        var dashboard = builder.Build(
            CreateContext(),
            new DateOnly(2026, 6, 15),
            [
                CreateTransaction(TransactionType.Income, 1000m, "Income", new DateOnly(2026, 6, 1)),
                CreateTransaction(TransactionType.Expense, 300m, "Food Delivery", new DateOnly(2026, 6, 10)),
                CreateTransaction(TransactionType.Expense, 200m, "Groceries", new DateOnly(2026, 6, 11))
            ],
            recentTransactionLimit: 6);

        Assert.Equal("2026-06", dashboard.Month);
        Assert.Equal(new DateOnly(2026, 6, 1), dashboard.PeriodStart);
        Assert.Equal(new DateOnly(2026, 6, 30), dashboard.PeriodEnd);
        Assert.Equal(1000m, dashboard.Income);
        Assert.Equal(500m, dashboard.Spends);
        Assert.Equal(500m, dashboard.Saved);
        Assert.Equal(50m, dashboard.SavingsRate);
        Assert.Collection(
            dashboard.Categories,
            category =>
            {
                Assert.Equal("Food Delivery", category.Name);
                Assert.Equal(300m, category.Amount);
                Assert.Equal(SpendingJudgment.NeedsAttention, category.Tone);
            },
            category =>
            {
                Assert.Equal("Groceries", category.Name);
                Assert.Equal(200m, category.Amount);
            });
        Assert.NotEmpty(dashboard.Judgements);
        Assert.NotEmpty(dashboard.Insights);
    }

    [Fact]
    public void Build_ReturnsEmptySnapshot_WhenNoTransactionsExist()
    {
        var dashboard = builder.Build(
            CreateContext(),
            new DateOnly(2026, 7, 20),
            [],
            recentTransactionLimit: 6);

        Assert.Equal("2026-07", dashboard.Month);
        Assert.Equal(0m, dashboard.Income);
        Assert.Equal(0m, dashboard.Spends);
        Assert.Equal(0m, dashboard.Saved);
        Assert.Null(dashboard.SavingsRate);
        Assert.Empty(dashboard.Categories);
        Assert.Contains(dashboard.Judgements, judgement => judgement.Title == "No tracked data");
        Assert.Contains(dashboard.Insights, insight => insight.Title == "Best next move");
    }

    [Fact]
    public void Build_UsesUncategorized_WhenExpenseHasNoCategory()
    {
        var dashboard = builder.Build(
            CreateContext(),
            new DateOnly(2026, 6, 1),
            [CreateTransaction(TransactionType.Expense, 125m, null, new DateOnly(2026, 6, 8))],
            recentTransactionLimit: 6);

        var category = Assert.Single(dashboard.Categories);
        Assert.Equal("Uncategorized", category.Name);
        Assert.Equal(125m, category.Amount);
    }

    [Fact]
    public void ToMonthStart_ReturnsFirstDayOfMonth()
    {
        Assert.Equal(
            new DateOnly(2026, 6, 1),
            MonthlyDashboardBuilder.ToMonthStart(new DateOnly(2026, 6, 28)));
    }

    private static AppUserContext CreateContext() =>
        new(
            UserProfileId,
            HouseholdId,
            "test@example.com",
            "Test User",
            "INR",
            "Asia/Calcutta",
            UserPlan.Premium,
            false,
            TransactionVisibility.Private);

    private static TransactionModel CreateTransaction(
        TransactionType type,
        decimal amount,
        string? categoryName,
        DateOnly transactionDate) =>
        new(
            Guid.NewGuid(),
            HouseholdId,
            UserProfileId,
            amount,
            "INR",
            type,
            categoryName,
            null,
            categoryName,
            categoryName ?? "manual",
            transactionDate,
            InputMode.Text,
            0.9m,
            TransactionVisibility.Private,
            transactionDate.ToDateTime(TimeOnly.MinValue),
            transactionDate.ToDateTime(TimeOnly.MinValue),
            "Test User");
}
