using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Goals;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Goals;

internal sealed class GoalPlanningWorker(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<GoalPlanningWorker> logger) : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan IdleDelay = TimeSpan.FromSeconds(3);
    private const int MaxRetries = 2;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await ProcessNextAsync(stoppingToken);
                if (!processed)
                {
                    await Task.Delay(IdleDelay, timeProvider, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Goal planning worker iteration failed.");
                await Task.Delay(IdleDelay, timeProvider, stoppingToken);
            }
        }
    }

    private async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var pendingId = await dbContext.GoalPlanningRuns.AsNoTracking()
            .Where(item => item.Status == GoalPlanningRunStatus.Pending)
            .OrderBy(item => item.CreatedAt)
            .Select(item => (Guid?)item.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (pendingId is null)
        {
            return false;
        }

        var now = timeProvider.GetUtcNow();
        var claimed = await dbContext.GoalPlanningRuns
            .Where(item => item.Id == pendingId.Value
                && item.Status == GoalPlanningRunStatus.Pending)
            .ExecuteUpdateAsync(update => update
                .SetProperty(item => item.Status, GoalPlanningRunStatus.Processing)
                .SetProperty(item => item.StartedAt, now)
                .SetProperty(item => item.Error, (string?)null)
                .SetProperty(item => item.FailureCategory, (string?)null),
                cancellationToken);
        if (claimed == 0)
        {
            return true;
        }

        var run = await dbContext.GoalPlanningRuns
            .FirstAsync(item => item.Id == pendingId.Value, cancellationToken);
        try
        {
            var modelClient = scope.ServiceProvider.GetRequiredService<IGoalPlanningModelClient>();
            var safetyIdentifiers = scope.ServiceProvider.GetRequiredService<IGoalPlanningSafetyIdentifier>();
            var goal = await dbContext.FinancialGoals.AsNoTracking()
                .FirstAsync(item => item.Id == run.GoalId, cancellationToken);
            var request = JsonSerializer.Deserialize<PostgresGoalPlanningService.StoredPlanningRequest>(
                run.RequestJson, JsonOptions)
                ?? throw new GoalPlanningValidationException("Stored planning request is invalid.");
            var snapshot = JsonSerializer.Deserialize<GoalFinancialSnapshot>(
                run.SnapshotJson, JsonOptions)
                ?? throw new GoalPlanningValidationException("Stored financial snapshot is invalid.");
            var candidates = snapshot.Candidates.ToArray();
            var result = await modelClient.GenerateAsync(
                new GoalPlanningModelRequest(
                    goal.GoalType.ToString(),
                    goal.TargetAmount,
                    goal.CurrentAmount,
                    request.TargetDate,
                    request.Pace,
                    request.MonthlyContribution,
                    snapshot,
                    request.Locale ?? "en-IN",
                    safetyIdentifiers.Create(run.RequestedByUserProfileId),
                    candidates.Length,
                    request.CustomizationContext),
                cancellationToken);
            ValidateModelResult(result, candidates);

            var plan = await dbContext.GoalPlans
                .FirstOrDefaultAsync(item => item.GoalId == goal.Id, cancellationToken);
            if (plan is null)
            {
                plan = new GoalPlan
                {
                    GoalId = goal.Id,
                    CreatedByUserProfileId = goal.CreatedByUserProfileId,
                    Status = GoalPlanStatus.Draft,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                dbContext.GoalPlans.Add(plan);
            }

            var nextVersion = (await dbContext.GoalPlanVersions
                .Where(item => item.GoalPlanId == plan.Id)
                .MaxAsync(item => (int?)item.VersionNumber, cancellationToken) ?? 0) + 1;
            var version = new GoalPlanVersion
            {
                GoalPlanId = plan.Id,
                SourceVersionId = run.SourceVersionId,
                CreatedByUserProfileId = run.RequestedByUserProfileId,
                VersionNumber = nextVersion,
                Source = run.RunType == GoalPlanningRunType.Review
                    ? GoalPlanVersionSource.AiReviewed
                    : GoalPlanVersionSource.Generated,
                UserContext = request.CustomizationContext,
                CreatedAt = now
            };
            dbContext.GoalPlanVersions.Add(version);
            for (var index = 0; index < candidates.Length; index++)
            {
                var modelOption = result.Options.ElementAt(index);
                dbContext.GoalPlanOptions.Add(PostgresGoalPlanningService.ToOption(
                    version.Id,
                    candidates[index],
                    modelOption.Title,
                    modelOption.Explanation,
                    snapshot.Warnings,
                    index,
                    modelOption.TradeOffs,
                    modelOption.Assumptions,
                    modelOption.Risks));
            }

            plan.UpdatedAt = now;
            run.Status = GoalPlanningRunStatus.Succeeded;
            run.ResultVersionId = version.Id;
            run.Model = result.Model;
            run.InputTokens = result.InputTokens;
            run.OutputTokens = result.OutputTokens;
            run.CompletedAt = timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (GoalPlanningProviderException exception)
        {
            if (exception.IsTransient && run.RetryCount < MaxRetries)
            {
                run.RetryCount++;
                run.Status = GoalPlanningRunStatus.Pending;
                run.StartedAt = null;
                run.FailureCategory = "provider_transient";
                run.Error = "The AI provider is temporarily unavailable; the run will be retried.";
            }
            else
            {
                run.Status = GoalPlanningRunStatus.Failed;
                run.FailureCategory = exception.IsTransient
                    ? "provider_retry_exhausted"
                    : "provider_unavailable";
                run.Error = exception.Message;
                run.CompletedAt = timeProvider.GetUtcNow();
            }
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Goal planning run {RunId} failed.", run.Id);
            run.Status = GoalPlanningRunStatus.Failed;
            run.FailureCategory = "invalid_plan";
            run.Error = "The generated plan could not be validated.";
            run.CompletedAt = timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    private static void ValidateModelResult(
        GoalPlanningModelResult result,
        IReadOnlyCollection<GoalPlanCandidate> candidates)
    {
        if (result.Options.Count != candidates.Count)
        {
            throw new GoalPlanningProviderException(
                "OpenAI returned an unexpected number of goal plan options.");
        }
        if (result.Options.Any(option => string.IsNullOrWhiteSpace(option.Title)
            || string.IsNullOrWhiteSpace(option.Explanation)))
        {
            throw new GoalPlanningProviderException(
                "OpenAI returned an incomplete goal plan.");
        }
    }
}
