using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Judgements;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Judgements;

internal sealed class PostgresJudgementService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    TimeProvider timeProvider) : IJudgementService
{
    public async Task<IReadOnlyCollection<JudgementModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);
        var period = new DateOnly(month.Year, month.Month, 1);
        var end = period.AddMonths(1);
        var now = timeProvider.GetUtcNow();

        var judgements = await dbContext.Judgements
            .AsNoTracking()
            .Where(judgement => judgement.HouseholdId == access.HouseholdId
                && judgement.Period >= period && judgement.Period < end
                && judgement.CandidateId != null
                && judgement.Status == JudgementLifecycleStatus.Active
                && judgement.ExpiresAt > now
                && ((judgement.Scope == JudgementReportScope.Personal
                        && judgement.UserProfileId == userContext.UserProfileId)
                    || (judgement.Scope == JudgementReportScope.Household
                        && judgement.UserProfileId == null && access.Kind == HouseholdKind.Family)))
            .GroupJoin(
                dbContext.JudgementUserStates.AsNoTracking()
                    .Where(state => state.UserProfileId == userContext.UserProfileId),
                judgement => judgement.Id,
                state => state.JudgementId,
                (judgement, states) => new { Judgement = judgement, State = states.FirstOrDefault() })
            .Where(row => row.State == null || row.State.DismissedAt == null
                && (row.State.SnoozedUntil == null || row.State.SnoozedUntil <= now))
            .OrderByDescending(row => row.Judgement.SeverityRank)
            .ThenBy(row => row.Judgement.CreatedAt)
            .Take(12)
            .ToArrayAsync(cancellationToken);

        return judgements.Select(row => Map(row.Judgement, row.State?.DismissedAt)).ToArray();
    }

    public async Task<bool> DismissAsync(
        AppUserContext userContext,
        Guid judgementId,
        CancellationToken cancellationToken)
    {
        var judgement = await dbContext.Judgements.FirstOrDefaultAsync(
            item => item.Id == judgementId,
            cancellationToken);
        if (judgement is null)
        {
            return false;
        }

        await householdAccessService.ResolveAsync(
            userContext,
            judgement.HouseholdId,
            requireWrite: false,
            cancellationToken);
        if (judgement.UserProfileId is not null && judgement.UserProfileId != userContext.UserProfileId)
        {
            return false;
        }

        var now = timeProvider.GetUtcNow();
        var state = await dbContext.JudgementUserStates.FirstOrDefaultAsync(
            item => item.JudgementId == judgementId
                && item.UserProfileId == userContext.UserProfileId,
            cancellationToken);
        if (state is null)
        {
            state = new JudgementUserState
            {
                JudgementId = judgementId,
                UserProfileId = userContext.UserProfileId,
                DismissedAt = now,
                CreatedAt = now,
                UpdatedAt = now
            };
            dbContext.JudgementUserStates.Add(state);
        }
        else
        {
            state.DismissedAt = now;
            state.UpdatedAt = now;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static JudgementModel Map(Judgement judgement, DateTimeOffset? dismissedAt = null) =>
        new(
            judgement.Id,
            judgement.RuleCode,
            judgement.SubjectType,
            judgement.SubjectId,
            judgement.HouseholdId,
            judgement.UserProfileId,
            judgement.Period,
            judgement.Severity,
            judgement.Tone,
            judgement.Title,
            judgement.Value,
            judgement.Message,
            judgement.InputsJson,
            judgement.CreatedAt,
            dismissedAt ?? judgement.DismissedAt);
}
