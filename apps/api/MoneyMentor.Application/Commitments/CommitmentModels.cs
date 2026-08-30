using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Commitments;

public sealed record CommitmentModel(
    Guid Id,
    Guid HouseholdId,
    Guid? UserProfileId,
    Guid? CategoryId,
    string? CategoryName,
    Guid? GoalId,
    string Name,
    TransactionType TransactionType,
    decimal Amount,
    CommitmentCadence Cadence,
    DateOnly NextDueDate,
    bool IsActive,
    DateTimeOffset? LastMatchedAt,
    DateTimeOffset? LastJudgementAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateCommitmentCommand(
    AppUserContext UserContext,
    Guid? HouseholdId,
    string Name,
    string? CategoryName,
    Guid? CategoryId,
    Guid? GoalId,
    TransactionType TransactionType,
    decimal Amount,
    CommitmentCadence Cadence,
    DateOnly NextDueDate,
    bool IsShared);

public sealed record UpdateCommitmentCommand(
    string? Name,
    string? CategoryName,
    Guid? CategoryId,
    Guid? GoalId,
    TransactionType? TransactionType,
    decimal? Amount,
    CommitmentCadence? Cadence,
    DateOnly? NextDueDate,
    bool? IsActive);

public interface ICommitmentService
{
    Task<IReadOnlyCollection<CommitmentModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken);

    Task<CommitmentModel> CreateAsync(
        CreateCommitmentCommand command,
        CancellationToken cancellationToken);

    Task<CommitmentModel?> UpdateAsync(
        AppUserContext userContext,
        Guid commitmentId,
        UpdateCommitmentCommand command,
        CancellationToken cancellationToken);

    Task<int> MatchDueCommitmentsAsync(CancellationToken cancellationToken);
}

public sealed class CommitmentValidationException(string message) : Exception(message);
