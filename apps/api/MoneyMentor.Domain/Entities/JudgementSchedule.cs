using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class JudgementSchedule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HouseholdId { get; set; }
    public Guid? UserProfileId { get; set; }
    public JudgementReportScope Scope { get; set; }
    public JudgementReportCadence Cadence { get; set; }
    public string TimeZone { get; set; } = string.Empty;
    public DateOnly NextPeriodStart { get; set; }
    public DateTimeOffset NextDueAt { get; set; }
    public DateOnly? LastEnqueuedPeriodStart { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
