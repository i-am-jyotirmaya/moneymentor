using Microsoft.EntityFrameworkCore;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class DailyFinancialFactStoreTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Rebuild_is_idempotent_and_respects_deletes_and_visibility()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString).Options;
        await using var db = new MoneyMentorDbContext(options);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var date = new DateOnly(2026, 6, 15);
        var user = new UserProfile
        {
            AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
            Email = "facts@example.test", DisplayName = "Facts", CurrencyCode = "INR", TimeZone = "Asia/Kolkata"
        };
        var household = new Household { Name = "Fact test", CreatedByUserProfileId = user.Id };
        var category = new Category
        {
            Name = "Food", Type = CategoryType.Expense,
            Classification = CategoryClassification.Discretionary, KeywordsJson = "[]"
        };
        db.UserProfiles.Add(user);
        db.Households.Add(household);
        db.Categories.Add(category);
        var privateExpense = new Transaction
        {
            HouseholdId = household.Id, UserProfileId = user.Id, CategoryId = category.Id,
            Amount = 120, Type = TransactionType.Expense, TransactionDate = date,
            Visibility = TransactionVisibility.Private, SourceText = "test"
        };
        db.Transactions.Add(privateExpense);
        db.Transactions.Add(new Transaction
        {
            HouseholdId = household.Id, UserProfileId = user.Id, CategoryId = category.Id,
            Amount = 80, Type = TransactionType.Expense, TransactionDate = date,
            Visibility = TransactionVisibility.Household, SourceText = "test"
        });
        await db.SaveChangesAsync();

        var store = new DailyFinancialFactStore(db, factory.Clock);
        await store.RebuildAsync(household.Id, date, CancellationToken.None);
        await store.RebuildAsync(household.Id, date, CancellationToken.None);
        var personal = await store.GetRollingAsync(household.Id, user.Id,
            JudgementReportScope.Personal, date.AddDays(1), 7, CancellationToken.None);
        Assert.Equal(200m, personal.Sum(x => x.Expense));
        Assert.Equal(2, personal.Sum(x => x.TransactionCount));
        var shared = await store.GetRollingAsync(household.Id, null,
            JudgementReportScope.Household, date.AddDays(1), 7, CancellationToken.None);
        Assert.Equal(80m, Assert.Single(shared).Expense);

        privateExpense.DeletedAt = factory.Clock.GetUtcNow();
        await db.SaveChangesAsync();
        await store.RebuildAsync(household.Id, date, CancellationToken.None);
        personal = await store.GetRollingAsync(household.Id, user.Id,
            JudgementReportScope.Personal, date.AddDays(1), 7, CancellationToken.None);
        Assert.Equal(80m, Assert.Single(personal).Expense);
    }
}
