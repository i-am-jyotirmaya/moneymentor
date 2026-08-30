using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class GoalContribution
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid GoalId { get; set; }

    public Guid? UserProfileId { get; set; }

    public decimal Amount { get; set; }

    public DateOnly ContributedAt { get; set; }

    public GoalContributionSource Source { get; set; } = GoalContributionSource.Manual;

    public Guid? TransactionId { get; set; }

    public Guid? CommitmentId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
