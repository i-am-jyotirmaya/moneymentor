using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class Transaction
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public Guid UserProfileId { get; set; }

    public decimal Amount { get; set; }

    public TransactionType Type { get; set; }

    public Guid? CategoryId { get; set; }

    public string? MerchantName { get; set; }

    public string? Description { get; set; }

    public string SourceText { get; set; } = string.Empty;

    public DateTimeOffset TransactionDate { get; set; }

    public InputMode InputMode { get; set; }

    public decimal Confidence { get; set; }

    public TransactionVisibility Visibility { get; set; }

    public Guid? UpdatedByUserProfileId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
