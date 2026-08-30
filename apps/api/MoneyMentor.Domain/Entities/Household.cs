using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class Household
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public HouseholdKind Kind { get; set; } = HouseholdKind.Family;

    public Guid CreatedByUserProfileId { get; set; }

    public string CurrencyCode { get; set; } = "INR";

    public string TimeZone { get; set; } = "Asia/Kolkata";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
