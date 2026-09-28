using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace MoneyMentor.Application.Telemetry;

public static class MoneyMentorTelemetry
{
    public const string SourceName = "MoneyMentor";

    public static readonly ActivitySource Activities = new(SourceName);
    public static readonly Meter Meter = new(SourceName);
    public static readonly Counter<long> RateLimitRejections = Meter.CreateCounter<long>("moneymentor.rate_limit.rejections");
    public static readonly Counter<long> AuthFailures = Meter.CreateCounter<long>("moneymentor.auth.failures");
    public static readonly Counter<long> ProvisioningRetries = Meter.CreateCounter<long>("moneymentor.profile.provisioning_retries");
    public static readonly Counter<long> InvitationDeliveries = Meter.CreateCounter<long>("moneymentor.invitation.deliveries");
    public static readonly Counter<long> TransactionLifecycle = Meter.CreateCounter<long>("moneymentor.transaction.lifecycle");
    public static readonly Histogram<long> JudgementQueueDepth = Meter.CreateHistogram<long>("moneymentor.judgement.queue_depth");
    public static readonly Counter<long> JudgementWorkAttempts = Meter.CreateCounter<long>("moneymentor.judgement.work_attempts");
    public static readonly Histogram<double> JudgementWorkDuration = Meter.CreateHistogram<double>("moneymentor.judgement.work_duration_ms", "ms");
    public static readonly Counter<long> JudgementNarrationFallbacks = Meter.CreateCounter<long>("moneymentor.judgement.narration_fallbacks");
    public static readonly Counter<long> JudgementLifecycleTransitions = Meter.CreateCounter<long>("moneymentor.judgement.lifecycle_transitions");
    public static readonly Counter<long> JudgementRuleConfigurationErrors = Meter.CreateCounter<long>("moneymentor.judgement.rule_configuration_errors");
    public static readonly Counter<long> DbCommands = Meter.CreateCounter<long>("moneymentor.db.commands");
    public static readonly Histogram<double> DbCommandDuration = Meter.CreateHistogram<double>("moneymentor.db.command.duration", "ms");
    public static readonly Counter<long> DbConnectionOpenFailures = Meter.CreateCounter<long>("moneymentor.db.connections.open_failures");
    public static readonly Counter<long> JevRequests = Meter.CreateCounter<long>("moneymentor.jev.requests");
    public static readonly Histogram<double> JevRequestDuration = Meter.CreateHistogram<double>("moneymentor.jev.request.duration", "ms");
    public static readonly Counter<long> Categorization = Meter.CreateCounter<long>("moneymentor.capture.categorization");
    public static readonly Counter<long> LlmRequests = Meter.CreateCounter<long>("moneymentor.llm.requests");
    public static readonly Histogram<double> LlmRequestDuration = Meter.CreateHistogram<double>("moneymentor.llm.request.duration", "ms");
    public static readonly Counter<long> LlmInputTokens = Meter.CreateCounter<long>("moneymentor.llm.input_tokens");
    public static readonly Counter<long> LlmOutputTokens = Meter.CreateCounter<long>("moneymentor.llm.output_tokens");
    public static readonly Counter<long> LlmUsageMissing = Meter.CreateCounter<long>("moneymentor.llm.usage_missing");
    public static readonly ObservableGauge<long> TelemetryHeartbeat = Meter.CreateObservableGauge<long>(
        "moneymentor.telemetry.heartbeat", () => 1);
}
