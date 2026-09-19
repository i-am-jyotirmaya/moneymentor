using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Console;

namespace MoneyMentor.Infrastructure.Logging;

public static class LoggingExtensions
{
    public static ILoggingBuilder AddCloudWatchConsole(this ILoggingBuilder builder) =>
        builder.AddConsole(options => options.FormatterName = CloudWatchConsoleFormatter.FormatterName)
            .AddConsoleFormatter<CloudWatchConsoleFormatter, ConsoleFormatterOptions>();

    /// <summary>A new execution attempt; scopes flow across awaits and child tasks.</summary>
    public static IDisposable? BeginJobRun(this ILogger logger, string jobName, string? runId = null) =>
        logger.BeginScope(new Dictionary<string, object?>
        {
            ["JobName"] = jobName,
            ["RunId"] = runId ?? Guid.NewGuid().ToString("N")
        });
}
