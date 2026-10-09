using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class AccountAwareTransactionTests(MoneyMentorApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    [Fact]
    public async Task Purchases_settlements_multiple_partial_refunds_and_fees_agree_across_dashboard_and_daily_facts()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, category) = await SeedAsync(db);
        var accounts = scope.ServiceProvider.GetRequiredService<IFinancialAccountService>();
        var bank = await accounts.SaveAsync(user, null, new(user.PersonalHouseholdId, "HDFC Salary Account", FinancialAccountType.BankAccount, "HDFC", "1111", ["HDFC"]), Ct);
        var card = await accounts.SaveAsync(user, null, new(user.PersonalHouseholdId, "HDFC Millennia", FinancialAccountType.CreditCard, "HDFC", "2222", ["Millennia"]), Ct);
        var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var purchase = await events.SaveAsync(user, Intent(user, TransactionKind.Purchase, 10000) with { CategoryId = category.Id, AccountAlias = "Millennia", Merchant = "Amazon", Description = "headphones" }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.CreditCardPayment, 10000) with { AccountAlias = "HDFC", CounterpartyAccountAlias = "Millennia" }, Ct);
        var refund = await events.SaveAsync(user, Intent(user, TransactionKind.Refund, 4000) with { RelatedTransactionId = purchase.Id }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Refund, 2000) with { RelatedTransactionId = purchase.Id }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Fee, 200) with { CategoryId = category.Id }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Income, 20000), Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Cashback, 100), Ct);
        Assert.Equal(category.Id, refund.CategoryId); Assert.Equal(card.Id, refund.AccountId); Assert.Equal(purchase.Id, refund.RelatedTransactionId);
        Assert.Equal("Amazon", refund.MerchantName); Assert.Equal(-4000m, refund.FinancialImpact.Spending);
        var dashboard = await scope.ServiceProvider.GetRequiredService<IMonthlyDashboardService>().GetMonthlyDashboardAsync(user, new(user.PersonalHouseholdId, user.CurrentDate, 6), Ct);
        Assert.Equal(4200m, dashboard.Spends); Assert.Equal(20000m, dashboard.Income);
        var facts = await db.DailyFinancialAggregates.Where(x => x.HouseholdId == user.PersonalHouseholdId).ToArrayAsync(Ct);
        Assert.Equal(dashboard.Spends, facts.Sum(x => x.Expense)); Assert.Equal(dashboard.Income, facts.Sum(x => x.Income));
        Assert.Equal(2, facts.Sum(x => x.ExpenseTransactionCount));
        Assert.Equal(2, await db.TransactionRelations.CountAsync(x => x.RelatedTransactionId == purchase.Id, Ct));
        Assert.Equal(bank.Id, (await accounts.ListAsync(user, user.PersonalHouseholdId, Ct)).Single(x => x.Name == "HDFC Salary Account").Id);
    }
    [Fact]
    public async Task Over_refunds_original_deletion_and_restore_overflow_are_rejected_atomically()
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, category) = await SeedAsync(db); var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var transactions = scope.ServiceProvider.GetRequiredService<ITransactionService>();
        var purchase = await events.SaveAsync(user, Intent(user, TransactionKind.Purchase, 10000) with { CategoryId = category.Id }, Ct);
        var first = await events.SaveAsync(user, Intent(user, TransactionKind.Refund, 6000) with { RelatedTransactionId = purchase.Id }, Ct);
        await Assert.ThrowsAsync<FinancialTransactionValidationException>(() => events.SaveAsync(user, Intent(user, TransactionKind.Refund, 5000) with { RelatedTransactionId = purchase.Id }, Ct));
        await Assert.ThrowsAsync<FinancialTransactionValidationException>(() => transactions.DeleteAsync(user, purchase.Id, Ct));
        await transactions.DeleteAsync(user, first.Id, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Refund, 5000) with { RelatedTransactionId = purchase.Id }, Ct);
        await Assert.ThrowsAsync<FinancialTransactionValidationException>(() => transactions.RestoreAsync(user, first.Id, Ct));
        db.ChangeTracker.Clear();
        Assert.Equal(5000m, await db.DailyFinancialAggregates.Where(x => x.HouseholdId == user.PersonalHouseholdId).SumAsync(x => x.Expense, Ct));
        Assert.Equal(3, await db.Transactions.CountAsync(x => x.HouseholdId == user.PersonalHouseholdId, Ct));
    }
    [Fact]
    public async Task Income_reversals_undo_income_and_purchase_refunds_do_not_create_income()
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, _) = await SeedAsync(db); var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var income = await events.SaveAsync(user, Intent(user, TransactionKind.Income, 1000), Ct);
        var reversal = await events.SaveAsync(user, Intent(user, TransactionKind.Reversal, 1000) with { RelatedTransactionId = income.Id }, Ct);
        Assert.Equal(-1000m, reversal.FinancialImpact.Income); Assert.Equal(0m, reversal.FinancialImpact.Spending);
        await Assert.ThrowsAsync<FinancialTransactionValidationException>(() => events.SaveAsync(user, Intent(user, TransactionKind.Refund, 100) with { RelatedTransactionId = income.Id }, Ct));
        Assert.Equal(0m, await db.DailyFinancialAggregates.Where(x => x.HouseholdId == user.PersonalHouseholdId).SumAsync(x => x.Income, Ct));
    }
    [Fact]
    public async Task Merchant_description_matching_links_unique_purchases_but_partial_ambiguous_matches_require_a_choice()
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, category) = await SeedAsync(db); var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var purchase = await events.SaveAsync(user, Intent(user, TransactionKind.Purchase, 2300) with { CategoryId = category.Id, Merchant = "Amazon", Description = "headphones" }, Ct);
        var refund = await events.SaveAsync(user, Intent(user, TransactionKind.Refund, 2300) with { Merchant = "Amazon", Description = "Refund for headphones" }, Ct);
        Assert.Equal(purchase.Id, refund.RelatedTransactionId);
        await events.SaveAsync(user, Intent(user, TransactionKind.Purchase, 3000) with { CategoryId = category.Id, Merchant = "Amazon" }, Ct);
        await Assert.ThrowsAsync<TransactionMatchRequiredException>(() => events.SaveAsync(user, Intent(user, TransactionKind.Refund, 1000) with { Merchant = "Amazon" }, Ct));
    }
    [Fact]
    public async Task Accounts_and_related_events_cannot_cross_households()
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, _) = await SeedAsync(db); var (other, _) = await SeedAsync(db);
        var accounts = scope.ServiceProvider.GetRequiredService<IFinancialAccountService>();
        var foreignAccount = await accounts.SaveAsync(other, null, new(other.PersonalHouseholdId, "Other bank", FinancialAccountType.BankAccount, null, null, []), Ct);
        var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var foreignPurchase = await events.SaveAsync(other, Intent(other, TransactionKind.Purchase, 100), Ct);
        await Assert.ThrowsAsync<FinancialTransactionValidationException>(() => events.SaveAsync(user, Intent(user, TransactionKind.Purchase, 50) with { AccountId = foreignAccount.Id }, Ct));
        await Assert.ThrowsAsync<FinancialTransactionValidationException>(() => events.SaveAsync(user, Intent(user, TransactionKind.Refund, 50) with { RelatedTransactionId = foreignPurchase.Id }, Ct));
        Assert.False(await db.Transactions.AnyAsync(x => x.HouseholdId == user.PersonalHouseholdId, Ct));
    }
    [Fact]
    public async Task Normalized_imports_are_idempotent_and_pair_bank_and_card_observations()
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, _) = await SeedAsync(db); var accounts = scope.ServiceProvider.GetRequiredService<IFinancialAccountService>();
        var bank = await accounts.SaveAsync(user, null, new(user.PersonalHouseholdId, "Bank", FinancialAccountType.BankAccount, null, null, []), Ct);
        var card = await accounts.SaveAsync(user, null, new(user.PersonalHouseholdId, "Card", FinancialAccountType.CreditCard, null, null, []), Ct);
        var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var intent = Intent(user, TransactionKind.CreditCardPayment, 30000) with { AccountId = bank.Id, CounterpartyAccountId = card.Id, ExternalReference = "shared-bank-reference" };
        var debit = await events.SaveAsync(user, intent, Ct);
        var replay = await events.SaveAsync(user, intent, Ct);
        Assert.Equal(debit.Id, replay.Id);
        var credit = await events.SaveAsync(user, intent with { ObservationAccountId = card.Id }, Ct);
        Assert.NotEqual(debit.Id, credit.Id);
        Assert.True(await db.TransactionRelations.AnyAsync(x => x.TransactionId == credit.Id && x.RelatedTransactionId == debit.Id && x.RelationType == TransactionRelationType.TransferPair, Ct));
        Assert.Equal(0m, await db.DailyFinancialAggregates.Where(x => x.HouseholdId == user.PersonalHouseholdId).SumAsync(x => x.Expense + x.Income, Ct));
    }
    [Fact]
    public async Task Concurrent_refunds_cannot_exceed_the_purchase()
    {
        AppUserContext user; TransactionModel purchase;
        using (var scope = factory.Services.CreateScope())
        {
            var seeded = await SeedAsync(scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>()); user = seeded.Item1;
            purchase = await scope.ServiceProvider.GetRequiredService<IFinancialEventService>().SaveAsync(user, Intent(user, TransactionKind.Purchase, 10000), Ct);
        }
        async Task<bool> RefundAsync()
        {
            using var scope = factory.Services.CreateScope();
            try { await scope.ServiceProvider.GetRequiredService<IFinancialEventService>().SaveAsync(user, Intent(user, TransactionKind.Refund, 6000) with { RelatedTransactionId = purchase.Id }, Ct); return true; }
            catch (FinancialTransactionValidationException) { return false; }
        }
        var results = await Task.WhenAll(RefundAsync(), RefundAsync());
        Assert.Single(results, x => x); Assert.Single(results, x => !x);
    }
    [Fact]
    public async Task Goal_capacity_uses_net_spending_and_includes_unclassified_finance_costs()
    {
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var (user, category) = await SeedAsync(db); var events = scope.ServiceProvider.GetRequiredService<IFinancialEventService>();
        var costs = new Category { HouseholdId = user.PersonalHouseholdId, Name = "Finance costs", Type = CategoryType.Expense, Classification = CategoryClassification.Debt, KeywordsJson = "[]" };
        db.Categories.Add(costs);
        var goal = new FinancialGoal { HouseholdId = user.PersonalHouseholdId, UserProfileId = user.UserProfileId,
            CreatedByUserProfileId = user.UserProfileId, Name = "Savings", TargetAmount = 100000, Status = FinancialGoalStatus.Active };
        db.FinancialGoals.Add(goal); await db.SaveChangesAsync(Ct);
        foreach (var month in new[] { 3, 4, 5 })
        {
            await events.SaveAsync(user, Intent(user, TransactionKind.Income, 10000) with { Date = new(2026, month, 10) }, Ct);
            await events.SaveAsync(user, Intent(user, TransactionKind.Cashback, 5000) with { Date = new(2026, month, 10) }, Ct);
        }
        var purchase = await events.SaveAsync(user, Intent(user, TransactionKind.Purchase, 1000) with { Date = new(2026, 5, 10), CategoryId = category.Id }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Refund, 400) with { Date = new(2026, 5, 11), RelatedTransactionId = purchase.Id }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.CreditCardPayment, 1000) with { Date = new(2026, 5, 12) }, Ct);
        await events.SaveAsync(user, Intent(user, TransactionKind.Interest, 150) with { Date = new(2026, 5, 12), CategoryId = costs.Id }, Ct);
        var snapshot = await scope.ServiceProvider.GetRequiredService<IGoalFinancialSnapshotBuilder>().BuildAsync(user, goal.Id, [], null, null, null, Ct);
        Assert.Equal(10000m, snapshot.MedianMonthlyIncome); Assert.Equal(200m, snapshot.AverageDiscretionarySpending);
        Assert.Equal(9750m, snapshot.ConservativeMonthlySurplus); Assert.Equal(7800m, snapshot.SafeMonthlyCapacity);
    }

    private static TransactionIntent Intent(AppUserContext user, TransactionKind kind, decimal amount) => new(kind, amount, user.CurrentDate) { HouseholdId = user.PersonalHouseholdId, SourceText = "integration financial event" };
    private static async Task<(AppUserContext, Category)> SeedAsync(MoneyMentorDbContext db)
    {
        var user = new UserProfile { AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(), Email = "financial@example.test", DisplayName = "Finance tester", CurrencyCode = "INR", TimeZone = "UTC" };
        var household = new Household { Name = "Financial semantics", CurrencyCode = "INR", CreatedByUserProfileId = user.Id };
        var category = new Category { HouseholdId = household.Id, Name = "Shopping", Type = CategoryType.Expense, Classification = CategoryClassification.Discretionary, KeywordsJson = "[]" };
        db.UserProfiles.Add(user); db.Households.Add(household); db.Categories.Add(category);
        db.HouseholdMembers.Add(new() { HouseholdId = household.Id, UserProfileId = user.Id, Role = HouseholdRole.Owner, Status = HouseholdMemberStatus.Active });
        await db.SaveChangesAsync(Ct);
        return (new(user.Id, household.Id, user.Email, user.DisplayName, "INR", "UTC", UserPlan.Premium, false, TransactionVisibility.Private) { CurrentDate = new(2026, 6, 20) }, category);
    }
}
