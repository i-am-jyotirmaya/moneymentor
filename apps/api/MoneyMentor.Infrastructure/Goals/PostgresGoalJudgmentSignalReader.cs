using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Goals;

internal sealed class PostgresGoalJudgmentSignalReader(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    DailyFinancialFactStore facts,
    TimeProvider clock) : IGoalJudgmentSignalReader
{
    public async Task<GoalJudgmentSignalSnapshot> ReadAsync(AppUserContext userContext,
        Guid goalId, CancellationToken cancellationToken)
    {
        var goal = await dbContext.FinancialGoals.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == goalId, cancellationToken)
            ?? throw new GoalPlanningValidationException("Goal was not found.");
        await householdAccessService.ResolveAsync(userContext, goal.HouseholdId,
            requireWrite: false, cancellationToken);
        if (goal.UserProfileId is Guid ownerId && ownerId != userContext.UserProfileId)
            throw new GoalPlanningForbiddenException("This private goal is not available.");

        var scope = goal.UserProfileId is null
            ? JudgementReportScope.Household : JudgementReportScope.Personal;
        var end = userContext.CurrentDate.AddDays(1);
        var rows = await facts.GetRollingAsync(goal.HouseholdId, goal.UserProfileId,
            scope, end, 90, cancellationToken);
        var windows = new[] { 30, 90 }.Select(days =>
        {
            var included = rows.Where(x => x.Date >= end.AddDays(-days)).ToArray();
            return new GoalJudgmentWindow(days, included.Sum(x => x.Income),
                included.Sum(x => x.Expense), included.Sum(x => x.EssentialSpend),
                included.Sum(x => x.DiscretionarySpend), included.Sum(x => x.DebtSpend),
                included.Sum(x => x.InvestmentAmount), included.Sum(x => x.TransactionCount),
                included.Select(x => x.CalculationVersion).Distinct().Order().LastOrDefault() ?? "v1");
        }).ToArray();

        var now = clock.GetUtcNow();
        var recent = await (
            from judgement in dbContext.Judgements.AsNoTracking()
            join candidate in dbContext.JudgmentCandidates.AsNoTracking()
                on judgement.CandidateId equals (Guid?)candidate.Id
            where judgement.HouseholdId == goal.HouseholdId
                && judgement.UserProfileId == goal.UserProfileId
                && judgement.Scope == scope
                && judgement.Status == JudgementLifecycleStatus.Active
                && judgement.DismissedAt == null && judgement.ExpiresAt > now
                && judgement.DecisionAction != null
                && candidate.WindowEndExclusive > end.AddDays(-90)
            orderby judgement.Importance descending, judgement.CreatedAt descending
            select new { judgement, candidate })
            .Take(20).ToArrayAsync(cancellationToken);
        var signals = recent.Where(x => RelevantToGoal(x.candidate.CandidateType,
                x.candidate.EvidenceJson, goalId))
            .Select(x => new GoalJudgmentSignal(x.candidate.Id, x.candidate.CandidateType,
                x.judgement.DecisionAction!.Value, x.judgement.Importance ?? 0m,
                x.judgement.DecisionConfidence ?? 0m, x.candidate.WindowStart,
                x.candidate.WindowEndExclusive, x.candidate.CurrentValue,
                x.candidate.BaselineValue, x.candidate.EvidenceJson, x.judgement.Reason))
            .ToArray();
        return new GoalJudgmentSignalSnapshot(goal.Id, userContext.CurrentDate, scope, windows, signals);
    }

    private static bool RelevantToGoal(string type, string evidenceJson, Guid goalId)
    {
        if (type != "GOAL_FUNDING_PRESSURE") return true;
        try
        {
            using var evidence = JsonDocument.Parse(evidenceJson);
            return evidence.RootElement.TryGetProperty("activeGoalIds", out var ids)
                && ids.ValueKind == JsonValueKind.Array
                && ids.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.String
                    && x.TryGetGuid(out var id) && id == goalId);
        }
        catch (JsonException) { return false; }
    }
}
