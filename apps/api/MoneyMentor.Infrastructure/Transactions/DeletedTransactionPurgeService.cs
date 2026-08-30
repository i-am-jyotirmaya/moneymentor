using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Transactions;

namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class DeletedTransactionPurgeService(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<DeletedTransactionPurgeService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await PurgeAsync(stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromDays(1), timeProvider);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await PurgeAsync(stoppingToken);
        }
    }

    private async Task PurgeAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<ITransactionService>();
            var count = await service.PurgeDeletedAsync(cancellationToken);
            if (count > 0)
            {
                logger.LogInformation("Purged {TransactionCount} expired deleted transactions.", count);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Deleted transaction purge failed.");
        }
    }
}
