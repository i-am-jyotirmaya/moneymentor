using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class CommitmentOccurrence
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CommitmentId { get; set; }
    public Guid HouseholdId { get; set; }
    public Guid? UserProfileId { get; set; }
    public Guid? MatchedTransactionId { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal ExpectedAmount { get; set; }
    public TransactionType TransactionType { get; set; }
    public CommitmentOccurrenceStatus Status { get; set; } = CommitmentOccurrenceStatus.Expected;
    public DateTimeOffset? MatchedAt { get; set; }
    public DateTimeOffset? EvaluatedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
