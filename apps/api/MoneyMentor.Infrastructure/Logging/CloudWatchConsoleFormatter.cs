using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging.Console;

namespace MoneyMentor.Infrastructure.Logging;

/// <summary>One JSON event per line, with stable fields for CloudWatch Logs Insights.</summary>
public sealed class CloudWatchConsoleFormatter(IHostEnvironment environment)
    : ConsoleFormatter(FormatterName)
{
    public const string FormatterName = "cloudwatch";
    private readonly string instanceId = Environment.MachineName;
    private readonly string processRunId = Guid.NewGuid().ToString("N");

    public override void Write<TState>(in LogEntry<TState> logEntry,
        IExternalScopeProvider? scopeProvider, TextWriter textWriter)
    {
        var scopeFields = new Dictionary<string, object?>();
        scopeProvider?.ForEachScope((scope, fields) => AddFields(scope, fields), scopeFields);
        var properties = new Dictionary<string, object?>();
        AddFields(logEntry.State, properties);

        var requestId = scopeFields.GetValueOrDefault("RequestId");
        var jobName = scopeFields.GetValueOrDefault("JobName");
        var runId = scopeFields.GetValueOrDefault("RunId");
        var activity = Activity.Current;
        // Write is called on the emitting thread, before ConsoleLogger queues the text.
        // Capturing this in a scope would incorrectly keep the pre-await thread ID.
        var record = new Dictionary<string, object?>
        {
            ["Timestamp"] = DateTimeOffset.UtcNow,
            ["Level"] = logEntry.LogLevel.ToString(),
            ["Service"] = environment.ApplicationName,
            ["Environment"] = environment.EnvironmentName,
            ["InstanceId"] = instanceId,
            ["ProcessId"] = Environment.ProcessId,
            ["ProcessRunId"] = processRunId,
            ["SourceContext"] = logEntry.Category,
            ["EventId"] = logEntry.EventId.Id,
            ["EventName"] = logEntry.EventId.Name,
            ["LogType"] = jobName is not null ? "Job" : requestId is not null ? "Request" : "System",
            ["RequestId"] = requestId,
            ["RunId"] = runId ?? (requestId is null ? processRunId : null),
            ["JobName"] = jobName,
            ["ThreadId"] = Environment.CurrentManagedThreadId,
            ["TraceId"] = activity?.TraceId.ToString(),
            ["SpanId"] = activity?.SpanId.ToString(),
            ["Message"] = logEntry.Formatter(logEntry.State, logEntry.Exception),
            ["MessageTemplate"] = properties.GetValueOrDefault("{OriginalFormat}"),
            ["Exception"] = logEntry.Exception?.ToString(),
            ["Properties"] = properties,
            ["Scope"] = scopeFields
        };
        textWriter.WriteLine(JsonSerializer.Serialize(record));
    }

    private static void AddFields(object? state, Dictionary<string, object?> fields)
    {
        if (state is not IEnumerable<KeyValuePair<string, object?>> values)
        {
            return;
        }

        foreach (var (key, value) in values)
        {
            // Avoid serializing arbitrary application graphs (or invoking their getters).
            fields[key] = value switch
            {
                null or string or bool or byte or sbyte or short or ushort or int or uint
                    or long or ulong or decimal => value,
                double number when double.IsFinite(number) => number,
                float number when float.IsFinite(number) => number,
                IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
                _ => value.ToString()
            };
        }
    }
}
