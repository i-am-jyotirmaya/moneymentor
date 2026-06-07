using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class AgentRun
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public string AgentName { get; set; } = string.Empty;

    public string TriggerType { get; set; } = string.Empty;

    public string? InputJson { get; set; }

    public string? OutputJson { get; set; }

    public AgentRunStatus Status { get; set; }

    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? CompletedAt { get; set; }

    public string? Error { get; set; }
}
