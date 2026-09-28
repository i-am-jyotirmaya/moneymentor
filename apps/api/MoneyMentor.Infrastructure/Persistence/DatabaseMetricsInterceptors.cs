using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MoneyMentor.Application.Telemetry;

namespace MoneyMentor.Infrastructure.Persistence;

// EF calls these once per executed command, including commands from background workers.
internal sealed class DatabaseCommandMetricsInterceptor : DbCommandInterceptor
{
    public override DbDataReader ReaderExecuted(DbCommand command, CommandExecutedEventData eventData, DbDataReader result)
    {
        Record(eventData, "reader", "success");
        return result;
    }

    public override ValueTask<DbDataReader> ReaderExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
        DbDataReader result, CancellationToken cancellationToken = default)
    {
        Record(eventData, "reader", "success");
        return ValueTask.FromResult(result);
    }

    public override int NonQueryExecuted(DbCommand command, CommandExecutedEventData eventData, int result)
    {
        Record(eventData, "nonquery", "success");
        return result;
    }

    public override ValueTask<int> NonQueryExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
        int result, CancellationToken cancellationToken = default)
    {
        Record(eventData, "nonquery", "success");
        return ValueTask.FromResult(result);
    }

    public override object? ScalarExecuted(DbCommand command, CommandExecutedEventData eventData, object? result)
    {
        Record(eventData, "scalar", "success");
        return result;
    }

    public override ValueTask<object?> ScalarExecutedAsync(DbCommand command, CommandExecutedEventData eventData,
        object? result, CancellationToken cancellationToken = default)
    {
        Record(eventData, "scalar", "success");
        return ValueTask.FromResult(result);
    }

    public override void CommandFailed(DbCommand command, CommandErrorEventData eventData)
    {
        Record(eventData, ExecuteMethod(eventData), "error");
    }

    public override Task CommandFailedAsync(DbCommand command, CommandErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        Record(eventData, ExecuteMethod(eventData), "error");
        return Task.CompletedTask;
    }

    private static string ExecuteMethod(CommandErrorEventData eventData) => eventData.ExecuteMethod switch
    {
        DbCommandMethod.ExecuteReader => "reader",
        DbCommandMethod.ExecuteNonQuery => "nonquery",
        DbCommandMethod.ExecuteScalar => "scalar",
        _ => "other"
    };

    private static void Record(CommandEndEventData data, string operation, string outcome)
    {
        var context = data.Context is MoneyMentorAuthDbContext ? "auth" : "app";
        var tags = new KeyValuePair<string, object?>[]
        {
            new("db_context", context), new("operation", operation), new("outcome", outcome)
        };
        MoneyMentorTelemetry.DbCommands.Add(1, tags);
        MoneyMentorTelemetry.DbCommandDuration.Record(data.Duration.TotalMilliseconds, tags);
    }
}

internal sealed class DatabaseConnectionMetricsInterceptor : DbConnectionInterceptor
{
    public override void ConnectionFailed(DbConnection connection, ConnectionErrorEventData eventData)
        => Record(eventData);

    public override Task ConnectionFailedAsync(DbConnection connection, ConnectionErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        Record(eventData);
        return Task.CompletedTask;
    }

    private static void Record(ConnectionErrorEventData data)
    {
        MoneyMentorTelemetry.DbConnectionOpenFailures.Add(1,
            new KeyValuePair<string, object?>("db_context",
                data.Context is MoneyMentorAuthDbContext ? "auth" : "app"));
    }
}
