using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class JudgementReportSchedulerWorker(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<JudgementReportWorkerOptions> options,
    ILogger<JudgementReportSchedulerWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.SchedulerEnabled)
        {
            logger.LogInformation("Judgement report scheduling is disabled.");
            return;
        }

        var repairInterval = TimeSpan.FromHours(options.Value.ScheduleRepairIntervalHours);
        var nextRepairAt = DateTimeOffset.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var now = timeProvider.GetUtcNow();
                await using var scope = scopeFactory.CreateAsyncScope();
                var store = scope.ServiceProvider.GetRequiredService<IJudgementReportWorkStore>();

                if (now >= nextRepairAt)
                {
                    await store.RepairSchedulesAsync(now, stoppingToken);
                    nextRepairAt = now.Add(repairInterval);
                }

                var enqueued = await store.EnqueueDueSchedulesAsync(now, stoppingToken);
                var depth = await store.GetQueueDepthAsync(now, stoppingToken);
                MoneyMentorTelemetry.JudgementQueueDepth.Record(
                    depth.Calculation,
                    new KeyValuePair<string, object?>("stage", "Calculation"));
                MoneyMentorTelemetry.JudgementQueueDepth.Record(
                    depth.Narration,
                    new KeyValuePair<string, object?>("stage", "Narration"));
                MoneyMentorTelemetry.JudgementQueueDepth.Record(
                    depth.Processing,
                    new KeyValuePair<string, object?>("stage", "Processing"));
                if (enqueued > 0)
                {
                    logger.LogInformation(
                        "Enqueued {JudgementReportCount} due judgement report calculations.",
                        enqueued);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Judgement report scheduler iteration failed.");
            }

            await DelayAsync(TimeSpan.FromSeconds(options.Value.SchedulerIntervalSeconds), stoppingToken);
        }
    }

    private async Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(delay, timeProvider, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }
}

internal abstract class JudgementReportStageWorker(
    JudgementWorkStage stage,
    Func<JudgementReportWorkerOptions, bool> enabled,
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<JudgementReportWorkerOptions> options,
    ILogger logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!enabled(options.Value))
        {
            logger.LogInformation("Judgement report {JudgementWorkStage} worker is disabled.", stage);
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var processed = 0;
            try
            {
                for (; processed < options.Value.BatchSize; processed++)
                {
                    if (!await ProcessNextAsync(stoppingToken))
                    {
                        break;
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Judgement report {JudgementWorkStage} worker iteration failed.", stage);
            }

            if (processed == 0)
            {
                await DelayAsync(stoppingToken);
            }
        }
    }

    private async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var store = scope.ServiceProvider.GetRequiredService<IJudgementReportWorkStore>();
        var now = timeProvider.GetUtcNow();
        var claim = await store.TryClaimAsync(stage, now, cancellationToken);
        if (claim is null)
        {
            return false;
        }

        using var leaseCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var renewal = RenewLeaseAsync(claim, leaseCancellation.Token);
        var startedAt = Stopwatch.GetTimestamp();
        var outcome = "succeeded";
        try
        {
            var pipeline = scope.ServiceProvider.GetRequiredService<IJudgementReportPipeline>();
            if (stage == JudgementWorkStage.Calculation)
            {
                await pipeline.CalculateAndPersistAsync(claim, cancellationToken);
            }
            else
            {
                await pipeline.NarrateAndPublishAsync(claim, cancellationToken);
            }

            await store.CompleteAsync(claim, timeProvider.GetUtcNow(), cancellationToken);
            logger.LogInformation(
                "Completed judgement report {JudgementWorkStage} work item {JudgementWorkItemId} generation {Generation}.",
                stage,
                claim.Id,
                claim.RequestedGeneration);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception exception)
        {
            var permanent = exception is JudgementReportPermanentException;
            outcome = permanent ? "permanent_failure" : "transient_failure";
            var category = permanent ? "Permanent" : "Transient";
            await store.FailAsync(
                claim,
                category,
                Sanitize(exception.Message),
                timeProvider.GetUtcNow(),
                cancellationToken);
            logger.LogWarning(
                exception,
                "Judgement report {JudgementWorkStage} work item {JudgementWorkItemId} failed in category {FailureCategory}.",
                stage,
                claim.Id,
                category);
        }
        finally
        {
            MoneyMentorTelemetry.JudgementWorkAttempts.Add(
                1,
                new("stage", stage.ToString()),
                new("outcome", outcome));
            MoneyMentorTelemetry.JudgementWorkDuration.Record(
                Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds,
                new("stage", stage.ToString()),
                new("outcome", outcome));
            await leaseCancellation.CancelAsync();
            try
            {
                await renewal;
            }
            catch (OperationCanceledException) when (leaseCancellation.IsCancellationRequested)
            {
            }
        }

        return true;
    }

    private async Task RenewLeaseAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var renewalDelay = TimeSpan.FromSeconds(Math.Max(10, options.Value.LeaseSeconds / 3));
        using var timer = new PeriodicTimer(renewalDelay, timeProvider);
        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            await using var renewalScope = scopeFactory.CreateAsyncScope();
            var renewalStore = renewalScope.ServiceProvider.GetRequiredService<IJudgementReportWorkStore>();
            var renewed = await renewalStore.RenewLeaseAsync(
                claim.Id,
                claim.ClaimToken,
                timeProvider.GetUtcNow(),
                cancellationToken);
            if (!renewed)
            {
                throw new InvalidOperationException(
                    $"Lease ownership was lost for judgement work item {claim.Id}.");
            }
        }
    }

    private async Task DelayAsync(CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(
                TimeSpan.FromSeconds(options.Value.PollIntervalSeconds),
                timeProvider,
                cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private static string Sanitize(string message)
    {
        var normalized = string.Join(' ', message.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Length <= 1000 ? normalized : normalized[..1000];
    }
}

internal sealed class JudgementReportCalculationWorker(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<JudgementReportWorkerOptions> options,
    ILogger<JudgementReportCalculationWorker> logger)
    : JudgementReportStageWorker(
        JudgementWorkStage.Calculation,
        static value => value.CalculationWorkerEnabled,
        scopeFactory,
        timeProvider,
        options,
        logger);

internal sealed class JudgementReportNarrationWorker(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<JudgementReportWorkerOptions> options,
    ILogger<JudgementReportNarrationWorker> logger)
    : JudgementReportStageWorker(
        JudgementWorkStage.Narration,
        static value => value.NarrationWorkerEnabled,
        scopeFactory,
        timeProvider,
        options,
        logger);
