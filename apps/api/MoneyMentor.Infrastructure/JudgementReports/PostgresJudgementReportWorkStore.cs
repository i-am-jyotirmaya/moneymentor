using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class PostgresJudgementReportWorkStore(
    MoneyMentorDbContext dbContext,
    IOptions<JudgementReportWorkerOptions> options) : IJudgementReportWorkStore
{
    private const long ScheduleRepairLock = 774_210_001;
    private const long NarrationClaimLock = 774_210_002;

    public async Task RepairSchedulesAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            $"SELECT pg_advisory_xact_lock({ScheduleRepairLock})",
            cancellationToken);

        var memberships = await dbContext.HouseholdMembers
            .Where(member => member.Status == HouseholdMemberStatus.Active)
            .Join(
                dbContext.Households,
                member => member.HouseholdId,
                household => household.Id,
                (member, household) => new { Member = member, Household = household })
            .ToArrayAsync(cancellationToken);
        var existing = await dbContext.JudgementSchedules.ToListAsync(cancellationToken);
        var desired = new HashSet<ScheduleKey>();

        foreach (var row in memberships)
        {
            foreach (var cadence in EnabledCadences())
            {
                AddDesired(row.Household, row.Member.UserProfileId, JudgementReportScope.Personal, cadence, now, existing, desired);
                if (row.Household.Kind == HouseholdKind.Family)
                {
                    AddDesired(row.Household, null, JudgementReportScope.Household, cadence, now, existing, desired);
                }
            }
        }

        foreach (var schedule in existing)
        {
            var key = new ScheduleKey(schedule.HouseholdId, schedule.UserProfileId, schedule.Scope, schedule.Cadence);
            if (!desired.Contains(key))
            {
                schedule.IsActive = false;
                schedule.UpdatedAt = now;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<int> EnqueueDueSchedulesAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var schedules = await dbContext.JudgementSchedules
            .FromSqlInterpolated($"""
                SELECT * FROM app.judgement_schedules
                WHERE "IsActive" = TRUE AND "NextDueAt" <= {now}
                ORDER BY "NextDueAt"
                FOR UPDATE SKIP LOCKED
                LIMIT {options.Value.BatchSize}
                """)
            .ToArrayAsync(cancellationToken);

        foreach (var schedule in schedules)
        {
            var period = ReportingPeriodCalculator.Create(schedule.Cadence, schedule.NextPeriodStart, schedule.TimeZone);
            var household = await dbContext.Households.AsNoTracking()
                .SingleAsync(item => item.Id == schedule.HouseholdId, cancellationToken);
            var work = await dbContext.JudgementWorkItems.FirstOrDefaultAsync(item =>
                item.HouseholdId == schedule.HouseholdId
                && item.UserProfileId == schedule.UserProfileId
                && item.Scope == schedule.Scope
                && item.Cadence == schedule.Cadence
                && item.PeriodStart == period.StartDate
                && item.Stage == JudgementWorkStage.Calculation,
                cancellationToken);
            if (work is null)
            {
                work = NewWorkItem(schedule, household, period, JudgementWorkStage.Calculation, now);
                dbContext.JudgementWorkItems.Add(work);
            }
            else
            {
                work.RequestedGeneration++;
                if (work.Status != JudgementWorkStatus.Processing)
                {
                    work.Status = JudgementWorkStatus.Pending;
                    work.AvailableAt = now;
                    work.AttemptCount = 0;
                    work.DeadLetteredAt = null;
                    work.FailureCategory = null;
                    work.LastError = null;
                }
                work.UpdatedAt = now;
            }

            schedule.LastEnqueuedPeriodStart = period.StartDate;
            schedule.NextPeriodStart = period.EndDateExclusive;
            var next = ReportingPeriodCalculator.Create(schedule.Cadence, period.EndDateExclusive, schedule.TimeZone);
            schedule.NextDueAt = next.EndInstant.AddMinutes(options.Value.BoundaryDelayMinutes);
            schedule.UpdatedAt = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return schedules.Length;
    }

    public async Task<JudgementQueueDepth> GetQueueDepthAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var calculation = await dbContext.JudgementWorkItems.AsNoTracking().CountAsync(item =>
            item.Stage == JudgementWorkStage.Calculation
            && item.RequestedGeneration > item.ProcessedGeneration
            && (item.Status == JudgementWorkStatus.Pending
                || item.Status == JudgementWorkStatus.Processing && item.LeaseExpiresAt <= now),
            cancellationToken);
        var narration = await dbContext.JudgementWorkItems.AsNoTracking().CountAsync(item =>
            item.Stage == JudgementWorkStage.Narration
            && item.RequestedGeneration > item.ProcessedGeneration
            && (item.Status == JudgementWorkStatus.Pending
                || item.Status == JudgementWorkStatus.Processing && item.LeaseExpiresAt <= now),
            cancellationToken);
        var processing = await dbContext.JudgementWorkItems.AsNoTracking().CountAsync(item =>
            item.Status == JudgementWorkStatus.Processing && item.LeaseExpiresAt > now,
            cancellationToken);
        return new JudgementQueueDepth(calculation, narration, processing);
    }

    public async Task<JudgementReportWorkClaim?> TryClaimAsync(
        JudgementWorkStage stage,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        if (stage == JudgementWorkStage.Narration)
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                $"SELECT pg_advisory_xact_lock({NarrationClaimLock})",
                cancellationToken);
            var activeNarrations = await dbContext.JudgementWorkItems.AsNoTracking().CountAsync(item =>
                item.Stage == JudgementWorkStage.Narration
                && item.Status == JudgementWorkStatus.Processing
                && item.LeaseExpiresAt > now,
                cancellationToken);
            if (activeNarrations >= options.Value.MaxNarrationConcurrency)
            {
                await transaction.RollbackAsync(cancellationToken);
                return null;
            }
        }
        var item = await dbContext.JudgementWorkItems
            .FromSqlInterpolated($"""
                SELECT * FROM app.judgement_work_items
                WHERE "Stage" = {stage.ToString()}
                  AND "AvailableAt" <= {now}
                  AND "RequestedGeneration" > "ProcessedGeneration"
                  AND ("Status" = 'Pending' OR ("Status" = 'Processing' AND "LeaseExpiresAt" <= {now}))
                ORDER BY "AvailableAt", "CreatedAt"
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """)
            .FirstOrDefaultAsync(cancellationToken);
        if (item is null)
        {
            await transaction.RollbackAsync(cancellationToken);
            return null;
        }

        item.Status = JudgementWorkStatus.Processing;
        item.ClaimToken = Guid.NewGuid();
        item.ClaimedBy = options.Value.WorkerId;
        item.LeaseExpiresAt = now.AddSeconds(options.Value.LeaseSeconds);
        item.AttemptCount++;
        item.UpdatedAt = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new JudgementReportWorkClaim(
            item.Id,
            item.HouseholdId,
            item.UserProfileId,
            item.Scope,
            item.Cadence,
            item.PeriodStart,
            item.PeriodEndExclusive,
            item.TimeZone,
            item.CurrencyCode,
            item.Stage,
            item.RequestedGeneration,
            item.ClaimToken.Value,
            item.AttemptCount,
            item.MaxAttempts);
    }

    public async Task<bool> RenewLeaseAsync(
        Guid workItemId,
        Guid claimToken,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var updated = await dbContext.JudgementWorkItems
            .Where(item => item.Id == workItemId
                && item.ClaimToken == claimToken
                && item.Status == JudgementWorkStatus.Processing)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(item => item.LeaseExpiresAt, now.AddSeconds(options.Value.LeaseSeconds))
                .SetProperty(item => item.UpdatedAt, now),
                cancellationToken);
        return updated == 1;
    }

    public async Task CompleteAsync(
        JudgementReportWorkClaim claim,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var item = await OwnedAsync(claim, cancellationToken);
        item.ProcessedGeneration = Math.Max(item.ProcessedGeneration, claim.RequestedGeneration);
        var hasNewGeneration = item.RequestedGeneration > item.ProcessedGeneration;
        item.Status = hasNewGeneration ? JudgementWorkStatus.Pending : JudgementWorkStatus.Completed;
        if (hasNewGeneration)
        {
            item.AttemptCount = 0;
        }
        item.AvailableAt = now;
        item.ClaimToken = null;
        item.ClaimedBy = null;
        item.LeaseExpiresAt = null;
        item.FailureCategory = null;
        item.LastError = null;
        item.UpdatedAt = now;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task FailAsync(
        JudgementReportWorkClaim claim,
        string category,
        string safeError,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var item = await OwnedAsync(claim, cancellationToken);
        if (item.RequestedGeneration > claim.RequestedGeneration)
        {
            item.ProcessedGeneration = Math.Max(item.ProcessedGeneration, claim.RequestedGeneration);
            item.Status = JudgementWorkStatus.Pending;
            item.AttemptCount = 0;
            item.AvailableAt = now;
            item.ClaimToken = null;
            item.ClaimedBy = null;
            item.LeaseExpiresAt = null;
            item.FailureCategory = null;
            item.LastError = null;
            item.UpdatedAt = now;
            await dbContext.SaveChangesAsync(cancellationToken);
            return;
        }
        var permanent = string.Equals(category, "Permanent", StringComparison.OrdinalIgnoreCase);
        if (permanent || item.AttemptCount >= item.MaxAttempts)
        {
            item.Status = JudgementWorkStatus.DeadLetter;
            item.DeadLetteredAt = now;
        }
        else
        {
            item.Status = JudgementWorkStatus.Pending;
            var retryIndex = Math.Clamp(item.AttemptCount - 1, 0, options.Value.RetryDelayMinutes.Length - 1);
            item.AvailableAt = now.AddMinutes(options.Value.RetryDelayMinutes[retryIndex]);
        }
        item.ClaimToken = null;
        item.ClaimedBy = null;
        item.LeaseExpiresAt = null;
        item.FailureCategory = category;
        item.LastError = safeError;
        item.UpdatedAt = now;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<JudgementWorkItem> OwnedAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken) =>
        await dbContext.JudgementWorkItems.SingleAsync(item =>
            item.Id == claim.Id
            && item.ClaimToken == claim.ClaimToken
            && item.Status == JudgementWorkStatus.Processing,
            cancellationToken);

    private void AddDesired(
        Household household,
        Guid? userId,
        JudgementReportScope scope,
        JudgementReportCadence cadence,
        DateTimeOffset now,
        ICollection<JudgementSchedule> existing,
        ISet<ScheduleKey> desired)
    {
        var key = new ScheduleKey(household.Id, userId, scope, cadence);
        if (!desired.Add(key))
        {
            return;
        }
        var schedule = existing.FirstOrDefault(item =>
            item.HouseholdId == key.HouseholdId
            && item.UserProfileId == key.UserProfileId
            && item.Scope == key.Scope
            && item.Cadence == key.Cadence);
        var current = ReportingPeriodCalculator.GetPeriodContaining(
            cadence,
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(household.TimeZone)).DateTime),
            household.TimeZone);
        if (schedule is null)
        {
            dbContext.JudgementSchedules.Add(new JudgementSchedule
            {
                HouseholdId = household.Id,
                UserProfileId = userId,
                Scope = scope,
                Cadence = cadence,
                TimeZone = household.TimeZone,
                NextPeriodStart = current.StartDate,
                NextDueAt = current.EndInstant.AddMinutes(options.Value.BoundaryDelayMinutes),
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
            return;
        }
        schedule.IsActive = true;
        if (!string.Equals(schedule.TimeZone, household.TimeZone, StringComparison.Ordinal))
        {
            schedule.TimeZone = household.TimeZone;
            schedule.NextPeriodStart = current.StartDate;
            schedule.NextDueAt = current.EndInstant.AddMinutes(options.Value.BoundaryDelayMinutes);
        }
        schedule.UpdatedAt = now;
    }

    private static JudgementWorkItem NewWorkItem(
        JudgementSchedule schedule,
        Household household,
        ReportingPeriod period,
        JudgementWorkStage stage,
        DateTimeOffset now) => new()
    {
        HouseholdId = schedule.HouseholdId,
        UserProfileId = schedule.UserProfileId,
        Scope = schedule.Scope,
        Cadence = schedule.Cadence,
        Stage = stage,
        PeriodStart = period.StartDate,
        PeriodEndExclusive = period.EndDateExclusive,
        TimeZone = period.TimeZone,
        CurrencyCode = household.CurrencyCode,
        Status = JudgementWorkStatus.Pending,
        RequestedGeneration = 1,
        ProcessedGeneration = 0,
        AvailableAt = now,
        MaxAttempts = 4,
        CreatedAt = now,
        UpdatedAt = now
    };

    private static IEnumerable<JudgementReportCadence> EnabledCadences()
    {
        yield return JudgementReportCadence.Weekly;
        yield return JudgementReportCadence.Monthly;
    }

    private sealed record ScheduleKey(
        Guid HouseholdId,
        Guid? UserProfileId,
        JudgementReportScope Scope,
        JudgementReportCadence Cadence);
}
