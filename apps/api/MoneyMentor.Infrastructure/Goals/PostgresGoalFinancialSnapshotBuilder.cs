using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Goals;

internal sealed class PostgresGoalFinancialSnapshotBuilder(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService) : IGoalFinancialSnapshotBuilder
{
    public async Task<GoalFinancialSnapshot> BuildAsync(
        AppUserContext userContext,
        Guid goalId,
        IReadOnlyCollection<Guid> participantUserProfileIds,
        GoalPlanPace? pace,
        DateOnly? targetDate,
        decimal? monthlyContribution,
        CancellationToken cancellationToken)
    {
        var goal = await dbContext.FinancialGoals.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == goalId, cancellationToken)
            ?? throw new GoalPlanningValidationException("Goal was not found.");
        await householdAccessService.ResolveAsync(
            userContext, goal.HouseholdId, requireWrite: false, cancellationToken);

        if (goal.UserProfileId is not null && goal.UserProfileId != userContext.UserProfileId)
        {
            throw new GoalPlanningForbiddenException("This private goal is not available.");
        }

        var includedUsers = new HashSet<Guid> { userContext.UserProfileId };
        if (goal.UserProfileId is null)
        {
            var requested = participantUserProfileIds
                .Where(id => id != userContext.UserProfileId)
                .Distinct()
                .ToArray();

            var consentQuery =
                from consent in dbContext.GoalPlanParticipantConsents.AsNoTracking()
                join member in dbContext.HouseholdMembers.AsNoTracking()
                    on new { HouseholdId = goal.HouseholdId, consent.UserProfileId }
                    equals new { member.HouseholdId, member.UserProfileId }
                where consent.GoalId == goalId
                    && consent.RevokedAt == null
                    && consent.PolicyVersion == GoalPlanningPolicy.ConsentVersion
                    && member.Status == HouseholdMemberStatus.Active
                    && consent.UserProfileId != userContext.UserProfileId
                select consent.UserProfileId;

            if (requested.Length > 0)
            {
                consentQuery = consentQuery.Where(id => requested.Contains(id));
            }

            var consented = await consentQuery
                .Distinct()
                .ToArrayAsync(cancellationToken);
            if (requested.Length > 0 && consented.Length != requested.Length)
            {
                throw new GoalPlanningConsentException(
                    "Every selected household member must opt in before private aggregates are used.");
            }

            includedUsers.UnionWith(consented);
        }

        var currentMonth = new DateOnly(userContext.CurrentDate.Year, userContext.CurrentDate.Month, 1);
        var periodStart = currentMonth.AddMonths(-3);
        var periodEnd = currentMonth.AddMonths(1);

        var rows = await (
            from transaction in dbContext.Transactions.AsNoTracking()
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categoryRows
            from category in categoryRows.DefaultIfEmpty()
            where transaction.HouseholdId == goal.HouseholdId
                && transaction.DeletedAt == null
                && transaction.TransactionDate >= periodStart
                && transaction.TransactionDate < periodEnd
                && (transaction.Visibility == TransactionVisibility.Household
                    || (transaction.UserProfileId != null && includedUsers.Contains(transaction.UserProfileId.Value)))
            select new SnapshotTransaction(
                transaction.TransactionDate,
                transaction.Amount,
                transaction.Type,
                category == null ? null : category.Classification))
            .ToArrayAsync(cancellationToken);

        var completeMonths = Enumerable.Range(1, 3)
            .Select(offset => currentMonth.AddMonths(-offset))
            .Order()
            .ToArray();
        var monthStats = completeMonths.Select(month =>
        {
            var monthEnd = month.AddMonths(1);
            var monthRows = rows.Where(item => item.Date >= month && item.Date < monthEnd).ToArray();
            return new MonthlySnapshot(
                monthRows.Where(item => item.Type == TransactionType.Income).Sum(item => item.Amount),
                monthRows.Where(item => item.Type == TransactionType.Expense
                    && item.Classification == CategoryClassification.Essential).Sum(item => item.Amount),
                monthRows.Where(item => item.Type == TransactionType.Expense
                    && item.Classification == CategoryClassification.Discretionary).Sum(item => item.Amount),
                monthRows.Where(item => item.Type == TransactionType.Investment
                    || item.Classification == CategoryClassification.Savings).Sum(item => item.Amount),
                monthRows.Length > 0);
        }).ToArray();

        var observedMonths = monthStats.Count(item => item.HasData);
        var medianIncome = Median(monthStats.Select(item => item.Income));
        var essential = Average(monthStats.Select(item => item.Essential));
        var discretionary = Average(monthStats.Select(item => item.Discretionary));
        var savings = Average(monthStats.Select(item => item.Savings));

        var commitments = await dbContext.Commitments.AsNoTracking()
            .Where(item => item.HouseholdId == goal.HouseholdId
                && item.IsActive
                && (item.UserProfileId == null || includedUsers.Contains(item.UserProfileId.Value)))
            .ToArrayAsync(cancellationToken);
        var monthlyCommitments = commitments.Sum(item => item.Cadence switch
        {
            CommitmentCadence.Monthly => item.Amount,
            CommitmentCadence.Quarterly => item.Amount / 3m,
            CommitmentCadence.Annual => item.Amount / 12m,
            _ => 0m
        });

        var otherRequirements = await dbContext.FinancialGoals.AsNoTracking()
            .Where(item => item.HouseholdId == goal.HouseholdId
                && item.Id != goal.Id
                && item.Status == FinancialGoalStatus.Active
                && (item.UserProfileId == null || includedUsers.Contains(item.UserProfileId.Value)))
            .SumAsync(item => item.MonthlyTarget ?? 0m, cancellationToken);

        var surplus = Math.Max(0m, medianIncome - essential - discretionary - monthlyCommitments);
        var safeCapacity = Math.Max(0m, decimal.Round((surplus * 0.8m) - otherRequirements, 2));
        var remaining = Math.Max(0m, goal.TargetAmount - goal.CurrentAmount);
        var candidates = GoalPlanDeterministicCalculator.BuildCandidates(
            userContext.CurrentDate,
            remaining,
            safeCapacity,
            pace,
            targetDate,
            monthlyContribution);
        var warnings = new List<string>();
        if (observedMonths < 3)
        {
            warnings.Add("Fewer than three complete months of tracked data are available.");
        }
        if (medianIncome <= 0m)
        {
            warnings.Add("No recurring income is visible in the planning period.");
        }
        if (safeCapacity <= 0m)
        {
            warnings.Add("No conservative monthly capacity is currently available.");
        }

        return new GoalFinancialSnapshot(
            userContext.CurrencyCode,
            userContext.CurrentDate,
            observedMonths,
            observedMonths < 3,
            medianIncome,
            essential,
            discretionary,
            savings,
            decimal.Round(monthlyCommitments, 2),
            decimal.Round(surplus, 2),
            safeCapacity,
            remaining,
            decimal.Round(otherRequirements, 2),
            null,
            candidates,
            warnings);
    }

    private static decimal Average(IEnumerable<decimal> values)
    {
        var array = values.ToArray();
        return array.Length == 0 ? 0m : decimal.Round(array.Average(), 2);
    }

    private static decimal Median(IEnumerable<decimal> values)
    {
        var array = values.Order().ToArray();
        if (array.Length == 0)
        {
            return 0m;
        }

        return array.Length % 2 == 1
            ? array[array.Length / 2]
            : decimal.Round((array[(array.Length / 2) - 1] + array[array.Length / 2]) / 2m, 2);
    }

    private sealed record SnapshotTransaction(
        DateOnly Date,
        decimal Amount,
        TransactionType Type,
        CategoryClassification? Classification);

    private sealed record MonthlySnapshot(
        decimal Income,
        decimal Essential,
        decimal Discretionary,
        decimal Savings,
        bool HasData);
}
