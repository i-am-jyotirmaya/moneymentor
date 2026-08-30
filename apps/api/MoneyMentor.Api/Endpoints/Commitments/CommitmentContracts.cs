using System.ComponentModel.DataAnnotations;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Commitments;

public sealed class CreateCommitmentRequest
{
    public Guid? HouseholdId { get; init; }

    [Required]
    [MaxLength(128)]
    public string Name { get; init; } = string.Empty;

    [MaxLength(128)]
    public string? CategoryName { get; init; }

    public Guid? CategoryId { get; init; }

    public Guid? GoalId { get; init; }

    public TransactionType TransactionType { get; init; } = TransactionType.Expense;

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal Amount { get; init; }

    public CommitmentCadence Cadence { get; init; } = CommitmentCadence.Monthly;

    public DateOnly NextDueDate { get; init; }

    public bool IsShared { get; init; }
}

public sealed class UpdateCommitmentRequest
{
    [MaxLength(128)]
    public string? Name { get; init; }

    [MaxLength(128)]
    public string? CategoryName { get; init; }

    public Guid? CategoryId { get; init; }

    public Guid? GoalId { get; init; }

    public TransactionType? TransactionType { get; init; }

    [Range(typeof(decimal), "0.01", "999999999999")]
    public decimal? Amount { get; init; }

    public CommitmentCadence? Cadence { get; init; }

    public DateOnly? NextDueDate { get; init; }

    public bool? IsActive { get; init; }
}
