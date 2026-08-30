namespace MoneyMentor.Domain.Entities;

public sealed class PrivacyConsent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserProfileId { get; set; }

    public string PolicyVersion { get; set; } = string.Empty;

    public DateTimeOffset AcceptedAt { get; set; } = DateTimeOffset.UtcNow;
}
