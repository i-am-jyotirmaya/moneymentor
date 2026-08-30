using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed record TransactionReportingSnapshot(
    Guid HouseholdId,
    Guid? UserProfileId,
    DateOnly TransactionDate,
    TransactionVisibility Visibility);

internal interface IJudgementReportRecalculationQueue
{
    Task EnqueueAsync(
        IReadOnlyCollection<TransactionReportingSnapshot> snapshots,
        CancellationToken cancellationToken);
}

internal sealed class JudgementReportRecalculationQueue(
    MoneyMentorDbContext dbContext,
    TimeProvider timeProvider) : IJudgementReportRecalculationQueue
{
    public async Task EnqueueAsync(
        IReadOnlyCollection<TransactionReportingSnapshot> snapshots,
        CancellationToken cancellationToken)
    {
        if (snapshots.Count == 0)
        {
            return;
        }
        var now = timeProvider.GetUtcNow();
        var householdIds = snapshots.Select(snapshot => snapshot.HouseholdId).Distinct().ToArray();
        var households = await dbContext.Households
            .Where(item => householdIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        var targets = new HashSet<Target>();
        foreach (var snapshot in snapshots.Distinct())
        {
            if (!households.TryGetValue(snapshot.HouseholdId, out var household))
            {
                continue;
            }
            foreach (var cadence in new[] { JudgementReportCadence.Weekly, JudgementReportCadence.Monthly })
            {
                var period = ReportingPeriodCalculator.GetPeriodContaining(cadence, snapshot.TransactionDate, household.TimeZone);
                if (period.EndInstant > now)
                {
                    continue;
                }
                if (snapshot.UserProfileId is Guid userId)
                {
                    targets.Add(new Target(household, userId, JudgementReportScope.Personal, period));
                }
                if (snapshot.Visibility == TransactionVisibility.Household && household.Kind == HouseholdKind.Family)
                {
                    targets.Add(new Target(household, null, JudgementReportScope.Household, period));
                }
            }
        }

        foreach (var target in targets)
        {
            await EnqueueTargetAndDependentsAsync(target, now, cancellationToken);
        }
    }

    private async Task EnqueueTargetAndDependentsAsync(
        Target target,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var horizonEnd = target.Period.Cadence == JudgementReportCadence.Weekly
            ? target.Period.StartDate.AddDays(7 * 8)
            : target.Period.StartDate.AddMonths(6);
        var dependentStarts = await dbContext.SpendingSummaries.AsNoTracking()
            .Where(summary => summary.HouseholdId == target.Household.Id
                && summary.UserProfileId == target.UserProfileId
                && summary.Scope == target.Scope
                && summary.Cadence == target.Period.Cadence
                && summary.Status == SpendingSummaryStatus.Published
                && summary.WindowStart >= target.Period.StartDate
                && summary.WindowStart <= horizonEnd)
            .Select(summary => summary.WindowStart)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        var starts = dependentStarts.Append(target.Period.StartDate).Distinct().Order().ToArray();
        foreach (var start in starts)
        {
            var period = ReportingPeriodCalculator.Create(target.Period.Cadence, start, target.Household.TimeZone);
            var tracked = dbContext.ChangeTracker.Entries<JudgementWorkItem>()
                .Select(entry => entry.Entity)
                .FirstOrDefault(item => Matches(item, target, start));
            var existing = tracked ?? await dbContext.JudgementWorkItems.FirstOrDefaultAsync(
                item => item.HouseholdId == target.Household.Id
                    && item.UserProfileId == target.UserProfileId
                    && item.Scope == target.Scope
                    && item.Cadence == target.Period.Cadence
                    && item.PeriodStart == start
                    && item.Stage == JudgementWorkStage.Calculation,
                cancellationToken);
            if (existing is null)
            {
                dbContext.JudgementWorkItems.Add(new JudgementWorkItem
                {
                    HouseholdId = target.Household.Id,
                    UserProfileId = target.UserProfileId,
                    Scope = target.Scope,
                    Cadence = target.Period.Cadence,
                    Stage = JudgementWorkStage.Calculation,
                    PeriodStart = period.StartDate,
                    PeriodEndExclusive = period.EndDateExclusive,
                    TimeZone = period.TimeZone,
                    CurrencyCode = target.Household.CurrencyCode,
                    Status = JudgementWorkStatus.Pending,
                    RequestedGeneration = 1,
                    AvailableAt = now,
                    MaxAttempts = 4,
                    CreatedAt = now,
                    UpdatedAt = now
                });
            }
            else
            {
                existing.RequestedGeneration++;
                if (existing.Status != JudgementWorkStatus.Processing)
                {
                    existing.Status = JudgementWorkStatus.Pending;
                    existing.AvailableAt = now;
                    existing.AttemptCount = 0;
                    existing.DeadLetteredAt = null;
                    existing.FailureCategory = null;
                    existing.LastError = null;
                }
                existing.UpdatedAt = now;
            }
        }
    }

    private static bool Matches(JudgementWorkItem item, Target target, DateOnly start) =>
        item.HouseholdId == target.Household.Id
        && item.UserProfileId == target.UserProfileId
        && item.Scope == target.Scope
        && item.Cadence == target.Period.Cadence
        && item.PeriodStart == start
        && item.Stage == JudgementWorkStage.Calculation;

    private sealed record Target(
        Household Household,
        Guid? UserProfileId,
        JudgementReportScope Scope,
        ReportingPeriod Period);
}
