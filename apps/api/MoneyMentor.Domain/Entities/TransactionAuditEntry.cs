namespace MoneyMentor.Domain.Entities;

public sealed class TransactionAuditEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TransactionId { get; set; }

    public Guid EditedByUserProfileId { get; set; }

    public DateTimeOffset EditedAt { get; set; } = DateTimeOffset.UtcNow;

    public string ChangedFieldsJson { get; set; } = string.Empty;
}
