using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Goals;

public sealed record GoalModel(
    Guid Id,
    Guid HouseholdId,
    Guid? UserProfileId,
    Guid CreatedByUserProfileId,
    string Name,
    FinancialGoalType GoalType,
    decimal TargetAmount,
    decimal CurrentAmount,
    DateOnly? TargetDate,
    decimal? MonthlyTarget,
    FinancialGoalPriority Priority,
    FinancialGoalStatus Status,
    decimal RemainingAmount,
    int? MonthsRemaining,
    decimal? RequiredMonthlyContribution,
    decimal? ProjectedMonthlyPace,
    DateOnly? ProjectedCompletionDate,
    DateTimeOffset? AchievedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record GoalContributionModel(
    Guid Id,
    Guid GoalId,
    Guid? UserProfileId,
    decimal Amount,
    DateOnly ContributedAt,
    GoalContributionSource Source,
    Guid? TransactionId,
    Guid? CommitmentId,
    DateTimeOffset CreatedAt);

public sealed record CreateGoalCommand(
    AppUserContext UserContext,
    Guid? HouseholdId,
    string Name,
    FinancialGoalType GoalType,
    decimal TargetAmount,
    DateOnly? TargetDate,
    decimal? MonthlyTarget,
    FinancialGoalPriority Priority,
    bool IsShared);

public sealed record UpdateGoalCommand(
    string? Name,
    FinancialGoalType? GoalType,
    decimal? TargetAmount,
    DateOnly? TargetDate,
    decimal? MonthlyTarget,
    FinancialGoalPriority? Priority,
    FinancialGoalStatus? Status);

public sealed record CreateGoalContributionCommand(
    AppUserContext UserContext,
    Guid GoalId,
    decimal Amount,
    DateOnly? ContributedAt,
    GoalContributionSource Source,
    Guid? TransactionId,
    Guid? CommitmentId);

public interface IGoalService
{
    Task<IReadOnlyCollection<GoalModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        CancellationToken cancellationToken);

    Task<GoalModel?> GetAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken);

    Task<GoalModel> CreateAsync(
        CreateGoalCommand command,
        CancellationToken cancellationToken);

    Task<GoalModel?> UpdateAsync(
        AppUserContext userContext,
        Guid goalId,
        UpdateGoalCommand command,
        CancellationToken cancellationToken);

    Task<GoalContributionModel?> AddContributionAsync(
        CreateGoalContributionCommand command,
        CancellationToken cancellationToken);
}

public sealed class GoalValidationException(string message) : Exception(message);
