namespace MoneyMentor.Domain.Entities;

public sealed class JudgementUserState
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid JudgementId { get; set; }
    public Guid UserProfileId { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
    public DateTimeOffset? DismissedAt { get; set; }
    public DateTimeOffset? SnoozedUntil { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
