using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class JudgmentCandidate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HouseholdId { get; set; }
    public Guid? UserProfileId { get; set; }
    public JudgementReportScope Scope { get; set; }
    public string CandidateType { get; set; } = string.Empty;
    public string SubjectType { get; set; } = string.Empty;
    public Guid? SubjectId { get; set; }
    public string SubjectKey { get; set; } = string.Empty;
    public string DeduplicationKey { get; set; } = string.Empty;
    public DateOnly WindowStart { get; set; }
    public DateOnly WindowEndExclusive { get; set; }
    public decimal? CurrentValue { get; set; }
    public decimal? BaselineValue { get; set; }
    public decimal? DeviationRatio { get; set; }
    public int? Frequency { get; set; }
    public decimal InterestingnessScore { get; set; }
    public decimal DetectorConfidence { get; set; }
    public string EvidenceJson { get; set; } = "{}";
    public string DetectorVersion { get; set; } = "v1";
    public string CalculationVersion { get; set; } = "v1";
    public JudgmentCandidateStatus Status { get; set; } = JudgmentCandidateStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTimeOffset AvailableAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public Guid? ClaimToken { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EvaluatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
}
