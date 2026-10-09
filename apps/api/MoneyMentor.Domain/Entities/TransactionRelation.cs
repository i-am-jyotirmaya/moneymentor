using MoneyMentor.Domain.Enums;
namespace MoneyMentor.Domain.Entities;

public sealed class TransactionRelation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TransactionId { get; set; }
    public Guid RelatedTransactionId { get; set; }
    public TransactionRelationType RelationType { get; set; }
    public decimal? Amount { get; set; }
    public decimal? Confidence { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
