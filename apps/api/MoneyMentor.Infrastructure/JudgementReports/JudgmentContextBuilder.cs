using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class JudgmentContextBuilder(MoneyMentorDbContext dbContext, DailyFinancialFactStore facts)
{
    public async Task<string> BuildAsync(JudgmentCandidate candidate, CancellationToken cancellationToken)
    {
        var end = candidate.WindowEndExclusive;
        var windows = new List<object>(3);
        foreach (var days in new[] { 7, 30, 90 })
        {
            var rows = await facts.GetRollingAsync(candidate.HouseholdId, candidate.UserProfileId,
                candidate.Scope, end, days, cancellationToken);
            windows.Add(new
            {
                days,
                income = rows.Sum(x => x.Income),
                expense = rows.Sum(x => x.Expense),
                investment = rows.Sum(x => x.InvestmentAmount),
                essential = rows.Sum(x => x.EssentialSpend),
                discretionary = rows.Sum(x => x.DiscretionarySpend),
                transactionCount = rows.Sum(x => x.TransactionCount),
                topCategories = rows.GroupBy(x => x.CategoryId).Select(x => new
                    { categoryId = x.Key, amount = x.Sum(row => row.Expense) })
                    .OrderByDescending(x => x.amount).Take(5).ToArray()
            });
        }
        var goals = await dbContext.FinancialGoals.AsNoTracking()
            .Where(x => x.HouseholdId == candidate.HouseholdId && x.UserProfileId == candidate.UserProfileId
                && x.Status == FinancialGoalStatus.Active)
            .OrderByDescending(x => x.Priority).Take(5)
            .Select(x => new { x.Id, x.Name, x.TargetAmount, x.CurrentAmount, x.TargetDate, x.Priority })
            .ToArrayAsync(cancellationToken);
        var recent = await dbContext.Judgements.AsNoTracking()
            .Where(x => x.HouseholdId == candidate.HouseholdId && x.UserProfileId == candidate.UserProfileId
                && x.Scope == candidate.Scope && x.Status == JudgementLifecycleStatus.Active)
            .OrderByDescending(x => x.CreatedAt).Take(3)
            .Select(x => new { x.RuleCode, x.Reason, x.CreatedAt })
            .ToArrayAsync(cancellationToken);

        using var evidence = JsonDocument.Parse(candidate.EvidenceJson);
        return JsonSerializer.Serialize(new
        {
            schemaVersion = "context-v1",
            candidate = new
            {
                candidate.Id, candidate.CandidateType, candidate.SubjectKey,
                candidate.WindowStart, candidate.WindowEndExclusive,
                candidate.CurrentValue, candidate.BaselineValue, candidate.DeviationRatio,
                candidate.Frequency, candidate.InterestingnessScore, candidate.DetectorConfidence,
                evidence = evidence.RootElement
            },
            financialState = windows,
            goals,
            recentJudgments = recent,
            // Scoped structured and semantic memories are added in the memory phase.
            dataQuality = new { factVersion = candidate.CalculationVersion, detectorVersion = candidate.DetectorVersion }
        });
    }
}
