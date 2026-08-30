using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class Judgement
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string RuleCode { get; set; } = string.Empty;

    public string DeduplicationKey { get; set; } = string.Empty;

    public string IssueKey { get; set; } = string.Empty;

    public string SubjectKey { get; set; } = string.Empty;

    public JudgementSubjectType SubjectType { get; set; }

    public Guid SubjectId { get; set; }

    public Guid HouseholdId { get; set; }

    public Guid? UserProfileId { get; set; }

    public DateOnly Period { get; set; }

    public JudgementReportScope Scope { get; set; } = JudgementReportScope.Personal;

    public JudgementReportCadence Cadence { get; set; } = JudgementReportCadence.Monthly;

    public Guid? SpendingSummaryId { get; set; }

    public Guid? ResolvingSummaryId { get; set; }

    public Guid? SupersedesJudgementId { get; set; }

    public Guid? SupersededByJudgementId { get; set; }

    public JudgementLifecycleStatus Status { get; set; } = JudgementLifecycleStatus.PendingNarration;

    public JudgementDirection Direction { get; set; } = JudgementDirection.Neutral;

    public JudgementSeverity Severity { get; set; }

    public int SeverityRank { get; set; }

    public SpendingJudgment Tone { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string InputsJson { get; set; } = "{}";

    public string FocusMetric { get; set; } = string.Empty;

    public string EvidenceJson { get; set; } = "{}";

    public string ThresholdsJson { get; set; } = "{}";

    public string ActionCode { get; set; } = string.Empty;

    public string ActionParametersJson { get; set; } = "{}";

    public string CalculationVersion { get; set; } = string.Empty;

    public string RuleVersion { get; set; } = string.Empty;

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? ResolvedAt { get; set; }

    public DateTimeOffset? SupersededAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? DismissedAt { get; set; }

    public Guid? DismissedByUserProfileId { get; set; }
}
