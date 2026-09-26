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
            if (!await appDb.Database.CanConnectAsync(cancellationToken))
            {
                return HealthCheckResult.Unhealthy(
                    "PostgreSQL is unavailable.");
            }

            return HealthCheckResult.Healthy();

        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("PostgreSQL readiness check failed.", exception);
        }
    }
}
