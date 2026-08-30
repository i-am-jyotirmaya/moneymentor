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
}
