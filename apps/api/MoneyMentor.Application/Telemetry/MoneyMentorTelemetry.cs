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
}
