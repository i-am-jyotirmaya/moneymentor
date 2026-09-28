using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace MoneyMentor.Application.Telemetry;

public static class MoneyMentorTelemetry
{
    public const string SourceName = "Spndrr";

    public static readonly ActivitySource Activities = new(SourceName);
    public static readonly Meter Meter = new(SourceName);
    public static readonly Counter<long> RateLimitRejections = Meter.CreateCounter<long>("spndrr.rate_limit.rejections");
    public static readonly Counter<long> AuthFailures = Meter.CreateCounter<long>("spndrr.auth.failures");
    public static readonly Counter<long> ProvisioningRetries = Meter.CreateCounter<long>("spndrr.profile.provisioning_retries");
    public static readonly Counter<long> InvitationDeliveries = Meter.CreateCounter<long>("spndrr.invitation.deliveries");
    public static readonly Counter<long> TransactionLifecycle = Meter.CreateCounter<long>("spndrr.transaction.lifecycle");
    public static readonly Histogram<long> JudgementQueueDepth = Meter.CreateHistogram<long>("spndrr.judgement.queue_depth");
    public static readonly Counter<long> JudgementWorkAttempts = Meter.CreateCounter<long>("spndrr.judgement.work_attempts");
    public static readonly Histogram<double> JudgementWorkDuration = Meter.CreateHistogram<double>("spndrr.judgement.work_duration_ms", "ms");
    public static readonly Counter<long> JudgementNarrationFallbacks = Meter.CreateCounter<long>("spndrr.judgement.narration_fallbacks");
    public static readonly Counter<long> JudgementLifecycleTransitions = Meter.CreateCounter<long>("spndrr.judgement.lifecycle_transitions");
    public static readonly Counter<long> JudgementRuleConfigurationErrors = Meter.CreateCounter<long>("spndrr.judgement.rule_configuration_errors");
    public static readonly Counter<long> DbCommands = Meter.CreateCounter<long>("spndrr.db.commands");
    public static readonly Histogram<double> DbCommandDuration = Meter.CreateHistogram<double>("spndrr.db.command.duration", "ms");
    public static readonly Counter<long> DbConnectionOpenFailures = Meter.CreateCounter<long>("spndrr.db.connections.open_failures");
    public static readonly Counter<long> JevRequests = Meter.CreateCounter<long>("spndrr.jev.requests");
    public static readonly Histogram<double> JevRequestDuration = Meter.CreateHistogram<double>("spndrr.jev.request.duration", "ms");
    public static readonly Counter<long> Categorization = Meter.CreateCounter<long>("spndrr.capture.categorization");
    public static readonly Counter<long> LlmRequests = Meter.CreateCounter<long>("spndrr.llm.requests");
    public static readonly Histogram<double> LlmRequestDuration = Meter.CreateHistogram<double>("spndrr.llm.request.duration", "ms");
    public static readonly Counter<long> LlmInputTokens = Meter.CreateCounter<long>("spndrr.llm.input_tokens");
    public static readonly Counter<long> LlmOutputTokens = Meter.CreateCounter<long>("spndrr.llm.output_tokens");
    public static readonly Counter<long> LlmUsageMissing = Meter.CreateCounter<long>("spndrr.llm.usage_missing");
    public static readonly ObservableGauge<long> TelemetryHeartbeat = Meter.CreateObservableGauge<long>(
        "spndrr.telemetry.heartbeat", () => 1);
}
