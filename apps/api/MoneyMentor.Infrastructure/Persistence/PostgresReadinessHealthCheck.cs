using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace MoneyMentor.Infrastructure.Persistence;

internal sealed class PostgresReadinessHealthCheck(
    IServiceScopeFactory scopeFactory) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var appDb = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
            var authDb = scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>();
            if (!await appDb.Database.CanConnectAsync(cancellationToken)
                || !await authDb.Database.CanConnectAsync(cancellationToken))
            {
                return HealthCheckResult.Unhealthy("PostgreSQL is unavailable.");
            }

            var pendingApp = await appDb.Database.GetPendingMigrationsAsync(cancellationToken);
            var pendingAuth = await authDb.Database.GetPendingMigrationsAsync(cancellationToken);
            if (pendingApp.Any() || pendingAuth.Any())
            {
                return HealthCheckResult.Unhealthy("Database migrations are pending.");
            }

            return HealthCheckResult.Healthy();
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("PostgreSQL readiness check failed.", exception);
        }
    }
}
