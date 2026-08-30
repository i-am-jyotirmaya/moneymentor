using Microsoft.Extensions.Options;

namespace MoneyMentor.Infrastructure.JudgementReports;

public sealed class JudgementReportWorkerOptions
{
    public const string SectionName = "JudgementReports";

    public bool SchedulerEnabled { get; set; }

    public bool CalculationWorkerEnabled { get; set; }

    public bool NarrationWorkerEnabled { get; set; }

    public int PollIntervalSeconds { get; set; } = 5;

    public int SchedulerIntervalSeconds { get; set; } = 60;

    public int ScheduleRepairIntervalHours { get; set; } = 24;

    public int BatchSize { get; set; } = 8;

    public int LeaseSeconds { get; set; } = 300;

    public int BoundaryDelayMinutes { get; set; } = 15;

    public int MaxAttempts { get; set; } = 4;

    public int MaxNarrationConcurrency { get; set; } = 2;

    public int[] RetryDelayMinutes { get; set; } = [1, 5, 30];

    public string WorkerId { get; set; } = $"{Environment.MachineName}:{Environment.ProcessId}";
}

internal sealed class JudgementReportWorkerOptionsValidator
    : IValidateOptions<JudgementReportWorkerOptions>
{
    public ValidateOptionsResult Validate(string? name, JudgementReportWorkerOptions options)
    {
        var failures = new List<string>();

        RequireRange(options.PollIntervalSeconds, 1, 300, nameof(options.PollIntervalSeconds), failures);
        RequireRange(options.SchedulerIntervalSeconds, 5, 3600, nameof(options.SchedulerIntervalSeconds), failures);
        RequireRange(options.ScheduleRepairIntervalHours, 1, 168, nameof(options.ScheduleRepairIntervalHours), failures);
        RequireRange(options.BatchSize, 1, 100, nameof(options.BatchSize), failures);
        RequireRange(options.LeaseSeconds, 30, 3600, nameof(options.LeaseSeconds), failures);
        RequireRange(options.BoundaryDelayMinutes, 0, 180, nameof(options.BoundaryDelayMinutes), failures);
        RequireRange(options.MaxAttempts, 1, 20, nameof(options.MaxAttempts), failures);
        RequireRange(options.MaxNarrationConcurrency, 1, 100, nameof(options.MaxNarrationConcurrency), failures);

        if (string.IsNullOrWhiteSpace(options.WorkerId) || options.WorkerId.Length > 200)
        {
            failures.Add($"{nameof(options.WorkerId)} must contain between 1 and 200 characters.");
        }

        if (options.RetryDelayMinutes.Length != options.MaxAttempts - 1
            || options.RetryDelayMinutes.Any(delay => delay is < 1 or > 1440)
            || !options.RetryDelayMinutes.SequenceEqual(options.RetryDelayMinutes.Order()))
        {
            failures.Add(
                $"{nameof(options.RetryDelayMinutes)} must contain {options.MaxAttempts - 1} ascending values between 1 and 1440 minutes.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private static void RequireRange(
        int value,
        int minimum,
        int maximum,
        string property,
        ICollection<string> failures)
    {
        if (value < minimum || value > maximum)
        {
            failures.Add($"{property} must be between {minimum} and {maximum}.");
        }
    }
}
