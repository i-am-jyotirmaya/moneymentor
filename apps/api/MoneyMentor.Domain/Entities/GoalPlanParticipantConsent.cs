namespace MoneyMentor.Domain.Entities;

public sealed class GoalPlanParticipantConsent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GoalId { get; set; }

    public Guid UserProfileId { get; set; }

    public string PolicyVersion { get; set; } = string.Empty;

    public DateTimeOffset ConsentedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? RevokedAt { get; set; }
}
