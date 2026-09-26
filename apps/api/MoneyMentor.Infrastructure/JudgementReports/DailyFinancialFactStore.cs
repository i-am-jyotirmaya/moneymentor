using Microsoft.EntityFrameworkCore;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class DailyFinancialFactStore(MoneyMentorDbContext dbContext, TimeProvider timeProvider)
{
    // Call inside the same database transaction as the mutation. The day lock serializes
    // competing writers and makes a replay or edit produce exactly the same fact rows.
    public async Task RebuildAsync(Guid householdId, DateOnly date, CancellationToken cancellationToken)
    {
        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({householdId.ToString() + date.ToString("yyyy-MM-dd")}, 0))",
            cancellationToken);
        var rows = await (
            from transaction in dbContext.Transactions.AsNoTracking()
            where transaction.HouseholdId == householdId && transaction.TransactionDate == date
                && transaction.DeletedAt == null
            join category in dbContext.Categories.AsNoTracking() on transaction.CategoryId equals category.Id into categories
            from category in categories.DefaultIfEmpty()
            select new
            {
                transaction.UserProfileId, transaction.Visibility, transaction.CategoryId,
                transaction.Amount, transaction.Type,
                Classification = category == null ? (CategoryClassification?)null : category.Classification
            }).ToArrayAsync(cancellationToken);

        await dbContext.DailyFinancialAggregates
            .Where(x => x.HouseholdId == householdId && x.Date == date)
            .ExecuteDeleteAsync(cancellationToken);

        var now = timeProvider.GetUtcNow();
        foreach (var group in rows.GroupBy(x => new { x.UserProfileId, x.Visibility, x.CategoryId }))
        {
            var items = group.ToArray();
            dbContext.DailyFinancialAggregates.Add(new DailyFinancialAggregate
            {
                HouseholdId = householdId,
                UserProfileId = group.Key.UserProfileId,
                Date = date,
                Visibility = group.Key.Visibility,
                CategoryId = group.Key.CategoryId,
                Income = items.Where(x => x.Type == TransactionType.Income).Sum(x => x.Amount),
                Expense = items.Where(x => x.Type == TransactionType.Expense).Sum(x => x.Amount),
                EssentialSpend = items.Where(x => x.Type == TransactionType.Expense && x.Classification == CategoryClassification.Essential).Sum(x => x.Amount),
                DiscretionarySpend = items.Where(x => x.Type == TransactionType.Expense && x.Classification == CategoryClassification.Discretionary).Sum(x => x.Amount),
                DebtSpend = items.Where(x => x.Type == TransactionType.Expense && x.Classification == CategoryClassification.Debt).Sum(x => x.Amount),
                InvestmentAmount = items.Where(x => x.Type == TransactionType.Investment).Sum(x => x.Amount),
                TransactionCount = items.Length,
                ExpenseTransactionCount = items.Count(x => x.Type == TransactionType.Expense),
                IncomeTransactionCount = items.Count(x => x.Type == TransactionType.Income),
                AverageTransactionAmount = decimal.Round(items.Average(x => x.Amount), 2),
                MaximumTransactionAmount = items.Max(x => x.Amount),
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task<DailyFinancialAggregate[]> GetRollingAsync(
        Guid householdId, Guid? userProfileId, JudgementReportScope scope,
        DateOnly endExclusive, int days, CancellationToken cancellationToken)
    {
        if (days is not (7 or 30 or 90)) throw new ArgumentOutOfRangeException(nameof(days));
        if (scope == JudgementReportScope.Personal && userProfileId is null)
            throw new ArgumentException("Personal facts require a user profile.", nameof(userProfileId));
        var start = endExclusive.AddDays(-days);
        var query = dbContext.DailyFinancialAggregates.AsNoTracking().Where(x =>
            x.HouseholdId == householdId && x.Date >= start && x.Date < endExclusive);
        query = scope == JudgementReportScope.Personal
            ? query.Where(x => x.UserProfileId == userProfileId)
            : query.Where(x => x.Visibility == TransactionVisibility.Household);
        return query.ToArrayAsync(cancellationToken);
    }
}
