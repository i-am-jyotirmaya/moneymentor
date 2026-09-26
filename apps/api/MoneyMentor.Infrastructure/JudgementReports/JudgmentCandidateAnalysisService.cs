using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class JudgmentCandidateAnalysisService(
    MoneyMentorDbContext dbContext,
    DailyFinancialFactStore facts,
    JudgmentDecisionWakeup wakeup,
    IOptions<CandidateDetectionOptions> options,
    TimeProvider clock)
{
    public async Task AnalyzeActiveAsync(CancellationToken cancellationToken)
    {
        var end = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime).AddDays(1);
        var start = end.AddDays(-90);
        var active = await dbContext.DailyFinancialAggregates.AsNoTracking()
            .Where(x => x.Date >= start && x.Date < end)
            .Select(x => new { x.HouseholdId, x.UserProfileId }).Distinct()
            .ToArrayAsync(cancellationToken);
        foreach (var householdId in active.Select(x => x.HouseholdId).Distinct())
        {
            await AnalyzeScopeAsync(householdId, null, JudgementReportScope.Household, end, cancellationToken);
            foreach (var userId in active.Where(x => x.HouseholdId == householdId)
                         .Select(x => x.UserProfileId).OfType<Guid>().Distinct())
                await AnalyzeScopeAsync(householdId, userId, JudgementReportScope.Personal, end, cancellationToken);
        }
    }

    internal async Task AnalyzeScopeAsync(Guid householdId, Guid? userId, JudgementReportScope scope,
        DateOnly end, CancellationToken cancellationToken)
    {
        var rows = await facts.GetRollingAsync(householdId, userId, scope, end, 90, cancellationToken);
        var goals = await dbContext.FinancialGoals.AsNoTracking()
            .Where(x => x.HouseholdId == householdId && x.Status == FinancialGoalStatus.Active
                && x.UserProfileId == userId).ToArrayAsync(cancellationToken);
        var commitments = await dbContext.Commitments.AsNoTracking()
            .Where(x => x.HouseholdId == householdId && x.UserProfileId == userId && x.IsActive)
            .ToArrayAsync(cancellationToken);
        var subscriptionIds = await dbContext.Categories.AsNoTracking()
            .Where(x => (x.HouseholdId == null || x.HouseholdId == householdId)
                && x.Type == CategoryType.Expense && EF.Functions.ILike(x.Name, "%subscription%"))
            .Select(x => x.Id).ToArrayAsync(cancellationToken);
        var merchantQuery = dbContext.Transactions.AsNoTracking().Where(x =>
            x.HouseholdId == householdId && x.DeletedAt == null && x.Type == TransactionType.Expense
            && x.MerchantId != null && x.TransactionDate >= end.AddDays(-35) && x.TransactionDate < end);
        merchantQuery = scope == JudgementReportScope.Personal
            ? merchantQuery.Where(x => x.UserProfileId == userId)
            : merchantQuery.Where(x => x.Visibility == TransactionVisibility.Household);
        var merchantRows = await merchantQuery.Select(x => new { x.MerchantId, x.Amount, x.TransactionDate })
            .ToArrayAsync(cancellationToken);
        var merchantFacts = merchantRows.GroupBy(x => x.MerchantId!.Value).Select(group =>
            new MerchantFrequencyFact(group.Key,
                group.Where(x => x.TransactionDate >= end.AddDays(-7)).Sum(x => x.Amount),
                group.Where(x => x.TransactionDate < end.AddDays(-7)).Sum(x => x.Amount) / 4m,
                group.Count(x => x.TransactionDate >= end.AddDays(-7)),
                group.Count(x => x.TransactionDate < end.AddDays(-7)) / 4m)).ToArray();
        var detected = JudgmentCandidateDetector.Detect(householdId, userId, scope, end,
            rows, goals, commitments, subscriptionIds.ToHashSet(), merchantFacts, options.Value);

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            SELECT pg_advisory_xact_lock(hashtextextended({householdId.ToString() + userId?.ToString() + end.ToString("yyyy-MM-dd")}, 0))
            """, cancellationToken);
        var keys = detected.Select(x => x.DeduplicationKey).ToArray();
        var existing = await dbContext.JudgmentCandidates
            .Where(x => keys.Contains(x.DeduplicationKey)).ToDictionaryAsync(x => x.DeduplicationKey, cancellationToken);
        foreach (var candidate in detected)
        {
            if (existing.TryGetValue(candidate.DeduplicationKey, out var previous))
            {
                if (previous.Status is not (JudgmentCandidateStatus.Pending or JudgmentCandidateStatus.Queued))
                    continue;
                previous.WindowStart = candidate.WindowStart;
                previous.WindowEndExclusive = candidate.WindowEndExclusive;
                previous.CurrentValue = candidate.CurrentValue;
                previous.BaselineValue = candidate.BaselineValue;
                previous.DeviationRatio = candidate.DeviationRatio;
                previous.Frequency = candidate.Frequency;
                previous.InterestingnessScore = candidate.InterestingnessScore;
                previous.EvidenceJson = candidate.EvidenceJson;
                previous.Status = candidate.Status;
            }
            else dbContext.JudgmentCandidates.Add(candidate);
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        if (detected.Any(x => x.Status == JudgmentCandidateStatus.Queued)) wakeup.Signal();
    }
}

internal sealed class JudgmentCandidateAnalysisWorker(
    IServiceScopeFactory scopes, IOptions<CandidateDetectionOptions> options,
    TimeProvider clock, ILogger<JudgmentCandidateAnalysisWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<JudgmentCandidateAnalysisService>()
                    .AnalyzeActiveAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError(error, "Judgment candidate analysis failed; retrying next interval."); }
            try { await Task.Delay(TimeSpan.FromHours(options.Value.AnalysisIntervalHours), clock, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
