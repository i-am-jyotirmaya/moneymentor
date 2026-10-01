using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Categories;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class TransactionCategorySelectionTests(MoneyMentorApiFactory factory)
{
    [Fact]
    public async Task Selecting_a_household_category_preserves_its_id_and_parent_even_with_duplicate_names()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (context, transaction, category, parent) = await SeedAsync(db);
        var secondParent = new Category
        {
            HouseholdId = transaction.HouseholdId, Name = "Travel", Type = CategoryType.Expense, KeywordsJson = "[]"
        };
        db.Categories.AddRange(secondParent, new Category
        {
            HouseholdId = transaction.HouseholdId, ParentCategoryId = secondParent.Id,
            Name = category.Name, Type = CategoryType.Expense, KeywordsJson = "[]"
        });
        await db.SaveChangesAsync();
        var categoryCount = await db.Categories.CountAsync();
        var service = scope.ServiceProvider.GetRequiredService<ITransactionService>();

        var updated = await service.UpdateAsync(context, transaction.Id,
            new UpdateTransactionCommand(null, null, null, null, null, null) { CategoryId = category.Id },
            CancellationToken.None);

        Assert.NotNull(updated);
        Assert.Equal(category.Id, updated.CategoryId);
        Assert.Equal(category.Name, updated.CategoryName);
        Assert.Equal(parent.Name, updated.ParentCategoryName);
        Assert.Equal(category.Id, await db.Transactions.Where(item => item.Id == transaction.Id)
            .Select(item => item.CategoryId).SingleAsync());
        Assert.Equal(categoryCount, await db.Categories.CountAsync());
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("other-household")]
    [InlineData("income")]
    [InlineData("hidden-category")]
    [InlineData("hidden-group")]
    public async Task Unavailable_category_selection_is_rejected_without_persisting_changes(string reason)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (context, transaction, category, parent) = await SeedAsync(db);
        if (reason == "other-household")
        {
            var other = new Household { Name = "Other", CreatedByUserProfileId = context.UserProfileId };
            db.Households.Add(other);
            category.HouseholdId = other.Id;
        }
        if (reason == "income") category.Type = CategoryType.Income;
        if (reason == "hidden-category") category.IsHidden = true;
        if (reason == "hidden-group") parent.IsHidden = true;
        await db.SaveChangesAsync();
        var service = scope.ServiceProvider.GetRequiredService<ITransactionService>();

        await Assert.ThrowsAsync<CategoryValidationException>(() => service.UpdateAsync(context, transaction.Id,
            new UpdateTransactionCommand(null, null, null, null, null, null)
            {
                CategoryId = reason == "missing" ? Guid.NewGuid() : category.Id
            }, CancellationToken.None));

        db.ChangeTracker.Clear();
        Assert.Null(await db.Transactions.Where(item => item.Id == transaction.Id)
            .Select(item => item.CategoryId).SingleAsync());
        Assert.False(await db.TransactionAuditEntries.AnyAsync(item => item.TransactionId == transaction.Id));
    }

    private static async Task<(AppUserContext, Transaction, Category, Category)> SeedAsync(MoneyMentorDbContext db)
    {
        var user = new UserProfile
        {
            AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
            Email = "category@example.test", DisplayName = "Category tester",
            CurrencyCode = "INR", TimeZone = "Asia/Kolkata"
        };
        var household = new Household { Name = "Category test", CreatedByUserProfileId = user.Id };
        var parent = new Category { HouseholdId = household.Id, Name = "Dining", Type = CategoryType.Expense, KeywordsJson = "[]" };
        var category = new Category
        {
            HouseholdId = household.Id, ParentCategoryId = parent.Id, Name = "Date Night",
            Type = CategoryType.Expense, Classification = CategoryClassification.Discretionary, KeywordsJson = "[]"
        };
        var transaction = new Transaction
        {
            HouseholdId = household.Id, UserProfileId = user.Id, Amount = 450,
            Type = TransactionType.Expense, TransactionDate = new DateOnly(2026, 9, 1),
            Visibility = TransactionVisibility.Private, SourceText = "dinner 450"
        };
        db.UserProfiles.Add(user);
        db.Households.Add(household);
        db.HouseholdMembers.Add(new HouseholdMember
        {
            HouseholdId = household.Id, UserProfileId = user.Id,
            Role = HouseholdRole.Owner, Status = HouseholdMemberStatus.Active
        });
        db.Categories.AddRange(parent, category);
        db.Transactions.Add(transaction);
        await db.SaveChangesAsync();
        return (new AppUserContext(user.Id, household.Id, user.Email, user.DisplayName, "INR", "Asia/Kolkata",
            UserPlan.Premium, false, TransactionVisibility.Private), transaction, category, parent);
    }
}
