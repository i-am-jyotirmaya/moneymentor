using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class DatabaseMetricsTests(MoneyMentorApiFactory factory) : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Both_contexts_emit_one_command_per_successful_query()
    {
        var contexts = new ConcurrentQueue<string>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, current) =>
        {
            if (instrument.Name == "spndrr.db.commands") current.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((_, value, tags, _) =>
        {
            if (value != 1) return;
            foreach (var tag in tags)
                if (tag.Key == "db_context") contexts.Enqueue(tag.Value?.ToString() ?? "");
        });
        listener.Start();

        using var scope = factory.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>().Categories.CountAsync();
        await scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>().Users.CountAsync();

        Assert.Contains("app", contexts);
        Assert.Contains("auth", contexts);
    }
}
