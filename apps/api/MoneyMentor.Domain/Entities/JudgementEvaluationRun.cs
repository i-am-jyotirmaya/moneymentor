using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class JudgementEvaluationRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SpendingSummaryId { get; set; }
    public Guid? JudgementWorkItemId { get; set; }
    public JudgementWorkStage Stage { get; set; }
    public int AttemptNumber { get; set; } = 1;
    public bool Succeeded { get; set; }
    public string CalculationVersion { get; set; } = string.Empty;
    public string RuleVersion { get; set; } = string.Empty;
    public string NarrationSchemaVersion { get; set; } = string.Empty;
    public string DeterministicInputJson { get; set; } = "{}";
    public string? NarrationOutputJson { get; set; }
    public string? Provider { get; set; }
    public string? Model { get; set; }
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public long DurationMilliseconds { get; set; }
    public string? FailureCategory { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
