namespace MoneyMentor.Domain.Entities;

public sealed class AssistantSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserProfileId { get; set; }

    public Guid HouseholdId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset LastMessageAt { get; set; } = DateTimeOffset.UtcNow;
}
