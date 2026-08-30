using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class JudgementWorkItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HouseholdId { get; set; }
    public Guid? UserProfileId { get; set; }
    public Guid? SpendingSummaryId { get; set; }
    public JudgementReportScope Scope { get; set; }
    public JudgementReportCadence Cadence { get; set; }
    public JudgementWorkStage Stage { get; set; }
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEndExclusive { get; set; }
    public string TimeZone { get; set; } = string.Empty;
    public string CurrencyCode { get; set; } = string.Empty;
    public JudgementWorkStatus Status { get; set; } = JudgementWorkStatus.Pending;
    public long RequestedGeneration { get; set; } = 1;
    public long ProcessedGeneration { get; set; }
    public DateTimeOffset AvailableAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? ClaimToken { get; set; }
    public string? ClaimedBy { get; set; }
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 4;
    public string? FailureCategory { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset? DeadLetteredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
