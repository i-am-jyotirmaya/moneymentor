using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class GoalPlanningRun
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GoalId { get; set; }

    public Guid RequestedByUserProfileId { get; set; }

    public Guid? SourceVersionId { get; set; }

    public Guid? ResultVersionId { get; set; }

    public GoalPlanningRunType RunType { get; set; }

    public GoalPlanningRunStatus Status { get; set; } = GoalPlanningRunStatus.Pending;

    public string RequestJson { get; set; } = "{}";

    public string SnapshotJson { get; set; } = "{}";

    public string? Model { get; set; }

    public string PromptVersion { get; set; } = string.Empty;

    public string SchemaVersion { get; set; } = string.Empty;

    public int InputTokens { get; set; }

    public int OutputTokens { get; set; }

    public int RetryCount { get; set; }

    public string? FailureCategory { get; set; }

    public string? Error { get; set; }

    public string IdempotencyKey { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }
}
