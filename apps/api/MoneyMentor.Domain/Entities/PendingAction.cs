namespace MoneyMentor.Domain.Entities;

public sealed class PendingAction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserProfileId { get; set; }

    public Guid HouseholdId { get; set; }

    public string ActionType { get; set; } = string.Empty;

    public string PayloadJson { get; set; } = string.Empty;

    public string? MissingFieldsJson { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
