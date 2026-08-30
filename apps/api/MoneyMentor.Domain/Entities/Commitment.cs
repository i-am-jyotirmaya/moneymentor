using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class Commitment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid HouseholdId { get; set; }

    public Guid? UserProfileId { get; set; }

    public Guid? CategoryId { get; set; }

    public Guid? GoalId { get; set; }

    public string Name { get; set; } = string.Empty;

    public TransactionType TransactionType { get; set; } = TransactionType.Expense;

    public decimal Amount { get; set; }

    public CommitmentCadence Cadence { get; set; } = CommitmentCadence.Monthly;

    public DateOnly NextDueDate { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTimeOffset? LastMatchedAt { get; set; }

    public DateTimeOffset? LastJudgementAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
