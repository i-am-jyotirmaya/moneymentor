using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed record JudgementReportWorkClaim(
    Guid Id,
    Guid HouseholdId,
    Guid? UserProfileId,
    JudgementReportScope Scope,
    JudgementReportCadence Cadence,
    DateOnly PeriodStart,
    DateOnly PeriodEndExclusive,
    string TimeZone,
    string CurrencyCode,
    JudgementWorkStage Stage,
    long RequestedGeneration,
    Guid ClaimToken,
    int AttemptCount,
    int MaxAttempts);

internal interface IJudgementReportWorkStore
{
    Task RepairSchedulesAsync(DateTimeOffset now, CancellationToken cancellationToken);

    Task<int> EnqueueDueSchedulesAsync(DateTimeOffset now, CancellationToken cancellationToken);

    Task<JudgementQueueDepth> GetQueueDepthAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task<JudgementReportWorkClaim?> TryClaimAsync(
        JudgementWorkStage stage,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task<bool> RenewLeaseAsync(
        Guid workItemId,
        Guid claimToken,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task CompleteAsync(
        JudgementReportWorkClaim claim,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task FailAsync(
        JudgementReportWorkClaim claim,
        string category,
        string safeError,
        DateTimeOffset now,
        CancellationToken cancellationToken);
}

internal sealed record JudgementQueueDepth(
    int Calculation,
    int Narration,
    int Processing);

internal interface IJudgementReportPipeline
{
    Task CalculateAndPersistAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken);

    Task NarrateAndPublishAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken);
}

internal sealed class JudgementReportPermanentException(string message) : Exception(message);
