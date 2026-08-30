using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Privacy;

public static class PrivacyPolicy
{
    public const string CurrentVersion = "2026-07-26-ai-planning.1";
}

public sealed record PrivacyConsentModel(
    string PolicyVersion,
    DateTimeOffset AcceptedAt);

public sealed record PrivacyExportModel(
    int SchemaVersion,
    DateTimeOffset GeneratedAt,
    UserSettingsModel Profile,
    IReadOnlyCollection<PrivacyConsentModel> Consents,
    IReadOnlyCollection<HouseholdSummaryModel> Households,
    IReadOnlyCollection<HouseholdInvitationModel> Invitations,
    IReadOnlyCollection<TransactionModel> Transactions,
    PrivacyOwnedRecordsModel OtherOwnedRecords);

public sealed record PrivacyOwnedRecordsModel(
    IReadOnlyCollection<PrivacyFinancialGoalModel> FinancialGoals,
    IReadOnlyCollection<PrivacyGoalPlanningRunModel> GoalPlanningRuns,
    IReadOnlyCollection<PrivacyGoalPlanVersionModel> GoalPlanVersions,
    IReadOnlyCollection<PrivacyGoalParticipantConsentModel> GoalParticipantConsents,
    IReadOnlyCollection<PrivacyInsightModel> Insights,
    IReadOnlyCollection<PrivacyAssistantSessionModel> AssistantSessions,
    IReadOnlyCollection<PrivacyPendingActionModel> PendingActions,
    IReadOnlyCollection<PrivacyEntitlementChangeModel> EntitlementChanges);

public sealed record PrivacyGoalPlanningRunModel(
    Guid Id,
    Guid GoalId,
    string RunType,
    string Status,
    string RequestJson,
    string SnapshotJson,
    string? Model,
    int InputTokens,
    int OutputTokens,
    string? FailureCategory,
    DateTimeOffset CreatedAt,
    DateTimeOffset? CompletedAt);

public sealed record PrivacyGoalPlanVersionModel(
    Guid Id,
    Guid GoalPlanId,
    Guid? SourceVersionId,
    int VersionNumber,
    string Source,
    string? UserContext,
    string OptionsJson,
    DateTimeOffset CreatedAt);

public sealed record PrivacyGoalParticipantConsentModel(
    Guid GoalId,
    string PolicyVersion,
    DateTimeOffset ConsentedAt,
    DateTimeOffset? RevokedAt);

public sealed record PrivacyFinancialGoalModel(
    Guid Id,
    Guid HouseholdId,
    string Name,
    decimal TargetAmount,
    decimal CurrentAmount,
    DateOnly? TargetDate,
    FinancialGoalPriority Priority,
    FinancialGoalStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record PrivacyInsightModel(
    Guid Id,
    Guid HouseholdId,
    string Type,
    string Title,
    string Summary,
    InsightSeverity Severity,
    SpendingJudgment Judgment,
    string? Recommendation,
    string? DataJson,
    InsightStatus Status,
    DateTimeOffset CreatedAt);

public sealed record PrivacyAssistantSessionModel(
    Guid Id,
    Guid HouseholdId,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastMessageAt,
    IReadOnlyCollection<PrivacyAssistantMessageModel> Messages);

public sealed record PrivacyAssistantMessageModel(
    Guid Id,
    MessageRole Role,
    string Content,
    string? Intent,
    string? ParsedDataJson,
    DateTimeOffset CreatedAt);

public sealed record PrivacyPendingActionModel(
    Guid Id,
    Guid HouseholdId,
    string ActionType,
    string PayloadJson,
    string? MissingFieldsJson,
    DateTimeOffset ExpiresAt,
    DateTimeOffset CreatedAt);

public sealed record PrivacyEntitlementChangeModel(
    UserPlan PreviousPlan,
    UserPlan NewPlan,
    string Operator,
    string Reason,
    DateTimeOffset ChangedAt);

public interface IPrivacyService
{
    Task<PrivacyConsentModel> AcceptAsync(
        AppUserContext userContext,
        string policyVersion,
        CancellationToken cancellationToken);

    Task<PrivacyExportModel> ExportAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken);

    Task<bool> DeleteAccountAsync(
        AppUserIdentity identity,
        string password,
        CancellationToken cancellationToken);
}
