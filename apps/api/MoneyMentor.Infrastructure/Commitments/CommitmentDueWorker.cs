using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Commitments;

namespace MoneyMentor.Infrastructure.Commitments;

internal sealed class CommitmentDueWorker(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<CommitmentDueWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(24), timeProvider);
        await RunOnceAsync(stoppingToken);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await RunOnceAsync(stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<ICommitmentService>();
            var matched = await service.MatchDueCommitmentsAsync(cancellationToken);
            if (matched > 0)
            {
                logger.LogInformation("Matched {MatchedCommitmentCount} due commitments.", matched);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Commitment due worker failed.");
        }
    }
}
