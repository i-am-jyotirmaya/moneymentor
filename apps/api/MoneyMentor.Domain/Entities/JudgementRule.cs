using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class JudgementRule
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Code { get; set; } = string.Empty;

    public JudgementRuleCategory Category { get; set; }

    public JudgementSeverity Severity { get; set; }

    public bool IsActive { get; set; } = true;

    public bool HouseholdScope { get; set; }

    public JudgementReportCadence Cadence { get; set; } = JudgementReportCadence.Monthly;

    public JudgementReportScope Scope { get; set; } = JudgementReportScope.Personal;

    public string RuleVersion { get; set; } = "v1";

    public string ParamsJson { get; set; } = "{}";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
