using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Goals;

public static class GoalPlanningPolicy
{
    public const string ConsentVersion = "2026-07-26-ai-goal-planning.1";
    public const string CalculationVersion = "goal-capacity-v1";
    public const string PromptVersion = "goal-planner-v1";
    public const string SchemaVersion = "goal-plan-v1";
}

public sealed record GoalPlanOptionModel(
    Guid Id,
    GoalPlanPace Pace,
    decimal MonthlyContribution,
    DateOnly ProjectedCompletionDate,
    GoalPlanFeasibility Feasibility,
    bool IsRecommended,
    string Title,
    string Explanation,
    IReadOnlyCollection<string> TradeOffs,
    IReadOnlyCollection<string> Assumptions,
    IReadOnlyCollection<string> Risks,
    IReadOnlyCollection<GoalPlanMilestoneModel> Milestones);

public sealed record GoalPlanMilestoneModel(
    string Label,
    DateOnly TargetDate,
    decimal TargetAmount);

public sealed record GoalPlanVersionModel(
    Guid Id,
    int VersionNumber,
    GoalPlanVersionSource Source,
    Guid? SourceVersionId,
    string? UserContext,
    DateTimeOffset CreatedAt,
    IReadOnlyCollection<GoalPlanOptionModel> Options);

public sealed record GoalPlanSummaryModel(
    Guid Id,
    GoalPlanStatus Status,
    Guid? ActiveVersionId,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyCollection<GoalPlanVersionModel> Versions);

public sealed record GoalDetailModel(
    GoalModel Goal,
    GoalPlanSummaryModel? Plan,
    GoalPlanParticipantConsentModel? CurrentUserConsent);

public sealed record GoalPlanningRunModel(
    Guid Id,
    Guid GoalId,
    GoalPlanningRunType RunType,
    GoalPlanningRunStatus Status,
    Guid? ResultVersionId,
    string? Model,
    int RetryCount,
    string? FailureCategory,
    string? Error,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    GoalPlanVersionModel? Result);

public sealed record GoalPlanParticipantConsentModel(
    Guid GoalId,
    Guid UserProfileId,
    string PolicyVersion,
    DateTimeOffset ConsentedAt,
    DateTimeOffset? RevokedAt);

public sealed record CreateGoalPlanningRunCommand(
    AppUserContext UserContext,
    Guid GoalId,
    GoalPlanPace? Pace,
    DateOnly? TargetDate,
    decimal? MonthlyContribution,
    IReadOnlyCollection<Guid> ParticipantUserProfileIds,
    string? Locale,
    string IdempotencyKey);

public sealed record CustomizeGoalPlanCommand(
    AppUserContext UserContext,
    Guid GoalId,
    Guid SourceVersionId,
    GoalPlanPace Pace,
    DateOnly? TargetDate,
    decimal? MonthlyContribution,
    string? CustomizationContext);

public sealed record CreateGoalPlanReviewRunCommand(
    AppUserContext UserContext,
    Guid GoalId,
    Guid SourceVersionId,
    string? Locale,
    string IdempotencyKey);

public sealed record GoalFinancialSnapshot(
    string CurrencyCode,
    DateOnly AsOfDate,
    int CompleteMonths,
    bool IsLowConfidence,
    decimal MedianMonthlyIncome,
    decimal AverageEssentialSpending,
    decimal AverageDiscretionarySpending,
    decimal AverageSavingsAndInvestments,
    decimal MonthlyCommitments,
    decimal ConservativeMonthlySurplus,
    decimal SafeMonthlyCapacity,
    decimal GoalRemainingAmount,
    decimal ExistingGoalMonthlyRequirements,
    decimal? EmergencyFundMonths,
    IReadOnlyCollection<GoalPlanCandidate> Candidates,
    IReadOnlyCollection<string> Warnings);

public sealed record GoalPlanCandidate(
    GoalPlanPace Pace,
    decimal MonthlyContribution,
    DateOnly ProjectedCompletionDate,
    GoalPlanFeasibility Feasibility);

public sealed record GoalPlanningModelRequest(
    string GoalType,
    decimal TargetAmount,
    decimal CurrentAmount,
    DateOnly? RequestedTargetDate,
    GoalPlanPace? RequestedPace,
    decimal? RequestedMonthlyContribution,
    GoalFinancialSnapshot Snapshot,
    string Locale,
    string SafetyIdentifier,
    int RequiredOptionCount,
    string? CustomizationContext);

public sealed record GoalPlanningModelResult(
    string Model,
    int InputTokens,
    int OutputTokens,
    IReadOnlyCollection<GoalPlanningModelOption> Options);

public sealed record GoalPlanningModelOption(
    GoalPlanPace Pace,
    string Title,
    string Explanation,
    IReadOnlyCollection<string> TradeOffs,
    IReadOnlyCollection<string> Assumptions,
    IReadOnlyCollection<string> Risks);

public interface IGoalPlanningModelClient
{
    Task<GoalPlanningModelResult> GenerateAsync(
        GoalPlanningModelRequest request,
        CancellationToken cancellationToken);
}

public interface IGoalPlanningSafetyIdentifier
{
    string Create(Guid userProfileId);
}

public interface IGoalFinancialSnapshotBuilder
{
    Task<GoalFinancialSnapshot> BuildAsync(
        AppUserContext userContext,
        Guid goalId,
        IReadOnlyCollection<Guid> participantUserProfileIds,
        GoalPlanPace? pace,
        DateOnly? targetDate,
        decimal? monthlyContribution,
        CancellationToken cancellationToken);
}

public interface IGoalPlanningService
{
    Task<GoalDetailModel?> GetDetailAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken);

    Task<GoalPlanningRunModel> CreateRunAsync(
        CreateGoalPlanningRunCommand command,
        CancellationToken cancellationToken);

    Task<GoalPlanningRunModel?> GetRunAsync(
        AppUserContext userContext,
        Guid goalId,
        Guid runId,
        CancellationToken cancellationToken);

    Task<GoalPlanVersionModel?> CustomizeAsync(
        CustomizeGoalPlanCommand command,
        CancellationToken cancellationToken);

    Task<GoalPlanningRunModel> CreateReviewRunAsync(
        CreateGoalPlanReviewRunCommand command,
        CancellationToken cancellationToken);

    Task<GoalPlanVersionModel?> ActivateAsync(
        AppUserContext userContext,
        Guid goalId,
        Guid versionId,
        string idempotencyKey,
        CancellationToken cancellationToken);

    Task<GoalPlanParticipantConsentModel?> GetConsentAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken);

    Task<GoalPlanParticipantConsentModel> ConsentAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken);

    Task<bool> RevokeConsentAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken);
}

public sealed class GoalPlanningValidationException(string message) : Exception(message);
public sealed class GoalPlanningForbiddenException(string message) : Exception(message);
public sealed class GoalPlanningConsentException(string message) : Exception(message);
public sealed class GoalPlanningRateLimitException(string message) : Exception(message);
public sealed class GoalPlanningProviderException(string message, bool isTransient = false, Exception? inner = null)
    : Exception(message, inner)
{
    public bool IsTransient { get; } = isTransient;
}
