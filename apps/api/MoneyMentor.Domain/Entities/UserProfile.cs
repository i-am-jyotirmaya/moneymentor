namespace MoneyMentor.Domain.Entities;

public sealed class UserProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string AuthProvider { get; set; } = string.Empty;

    public string AuthSubject { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string CurrencyCode { get; set; } = string.Empty;

    public string TimeZone { get; set; } = string.Empty;

    public bool IsOnboardingCompleted { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
