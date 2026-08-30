using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public sealed record JudgementReportMetricModel(
    SummaryMetricCode Code,
    decimal? Current,
    decimal? Previous,
    decimal? Baseline,
    decimal? PreviousDelta,
    decimal? PreviousDeltaPercent,
    decimal? BaselineDelta,
    decimal? BaselineDeltaPercent,
    MetricTrend PreviousTrend,
    MetricTrend BaselineTrend);

public sealed record JudgementReportCategoryModel(
    string SubjectKey,
    Guid? CategoryId,
    string Name,
    CategoryClassification? Classification,
    decimal Amount,
    decimal? Share,
    int TransactionCount,
    decimal? PreviousAmount,
    decimal? PreviousDeltaAmount,
    decimal? PreviousDeltaPercent,
    decimal? BaselineAmount,
    decimal? BaselineDeltaAmount,
    decimal? BaselineDeltaPercent,
    decimal? BaselineShareDeltaPoints,
    MetricTrend BaselineTrend,
    bool IsMaterial,
    JudgementDirection Direction);

public sealed record JudgementReportObservationModel(
    Guid Id,
    string RuleCode,
    string IssueKey,
    JudgementDirection Direction,
    JudgementSeverity Severity,
    int SeverityRank,
    SpendingJudgment Tone,
    JudgementLifecycleStatus Status,
    string Title,
    string Value,
    string Message,
    string ActionCode,
    string ActionParametersJson,
    string EvidenceJson,
    DateTimeOffset? ResolvedAt,
    DateTimeOffset ExpiresAt,
    bool IsDismissed);

public sealed record JudgementReportModel(
    Guid Id,
    Guid HouseholdId,
    Guid? UserProfileId,
    JudgementReportScope Scope,
    JudgementReportCadence Cadence,
    string Period,
    DateOnly StartDate,
    DateOnly EndDateExclusive,
    string TimeZone,
    string CurrencyCode,
    int Revision,
    string CalculationVersion,
    SpendingSummaryStatus Status,
    JudgementReportDirection Direction,
    JudgementDataConfidence Confidence,
    int BaselinePeriodsUsed,
    IReadOnlyCollection<string> DataQualityFlags,
    IReadOnlyCollection<JudgementReportMetricModel> Metrics,
    IReadOnlyCollection<JudgementReportCategoryModel> Categories,
    IReadOnlyCollection<JudgementReportObservationModel> Judgements,
    JudgementNarration? Narration,
    NarrationStatus NarrationStatus,
    bool IsProcessingUpdate,
    DateTimeOffset CalculatedAt,
    DateTimeOffset? PublishedAt);

public sealed record JudgementReportRequest(
    AppUserContext UserContext,
    Guid? HouseholdId,
    JudgementReportScope Scope,
    JudgementReportCadence Cadence,
    string? Period = null);

public interface IJudgementReportService
{
    Task<JudgementReportModel?> GetAsync(
        JudgementReportRequest request,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<JudgementReportModel>> ListHistoryAsync(
        JudgementReportRequest request,
        string? before,
        int limit,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<JudgementReportObservationModel>> ListActiveAsync(
        JudgementReportRequest request,
        CancellationToken cancellationToken);
}
