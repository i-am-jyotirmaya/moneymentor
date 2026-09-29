using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class FinancialContextMemory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid HouseholdId { get; set; }
    public Guid UserProfileId { get; set; }
    public TransactionVisibility Visibility { get; set; } = TransactionVisibility.Private;
    public string MemoryType { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string StructuredDataJson { get; set; } = "{}";
    public string SourceType { get; set; } = string.Empty;
    public Guid? SourceMessageId { get; set; }
    public Guid? SourceJudgementId { get; set; }
    public Guid? SourceFeedbackId { get; set; }
    public decimal Confidence { get; set; }
    public decimal Importance { get; set; }
    public DateTimeOffset? ValidFrom { get; set; }
    public DateTimeOffset? ValidUntil { get; set; }
    public bool IsActive { get; set; } = true;
    public string? EmbeddingModel { get; set; }
    // The optional vector(1536) column is queried via parameterized SQL to keep
    // provider-specific vector types out of the Domain assembly.
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
