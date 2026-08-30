using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Households;

public sealed record HouseholdSummaryModel(
    Guid Id,
    string Name,
    HouseholdKind Kind,
    string CurrencyCode,
    string TimeZone,
    HouseholdRole Role,
    HouseholdMemberStatus Status,
    bool CanWrite,
    int MemberCount,
    DateTimeOffset CreatedAt);

public sealed record HouseholdDashboardModel(
    UserPlan Plan,
    bool CanUseHouseholds,
    Guid DefaultHouseholdId,
    IReadOnlyCollection<HouseholdSummaryModel> Households);

public sealed record CreateHouseholdCommand(
    AppUserContext UserContext,
    string Name);

public sealed record UpdateHouseholdSettingsCommand(
    AppUserContext UserContext,
    Guid HouseholdId,
    string CurrencyCode,
    string TimeZone);

public enum UpdateHouseholdSettingsStatus
{
    Succeeded,
    Forbidden,
    NotFound,
    CurrencyLocked,
    InvalidCurrency,
    InvalidTimeZone
}

public sealed record UpdateHouseholdSettingsResult(
    UpdateHouseholdSettingsStatus Status,
    HouseholdSummaryModel? Household = null);

public sealed record HouseholdInvitationModel(
    Guid Id,
    Guid HouseholdId,
    string HouseholdName,
    string Email,
    HouseholdRole Role,
    HouseholdInvitationStatus Status,
    string InvitedByDisplayName,
    DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? RespondedAt,
    InvitationDeliveryStatus DeliveryStatus,
    int DeliveryAttemptCount,
    DateTimeOffset? SentAt,
    string? LastDeliveryError);

public enum HouseholdInvitationResultStatus
{
    Succeeded,
    Forbidden,
    NotFound,
    Conflict,
    Expired,
    InvalidRole
}

public sealed record HouseholdInvitationResult(
    HouseholdInvitationResultStatus Status,
    HouseholdInvitationModel? Invitation = null);

public sealed record CreateHouseholdInvitationCommand(
    AppUserContext UserContext,
    Guid HouseholdId,
    string Email,
    HouseholdRole Role);

public sealed record RespondToHouseholdInvitationCommand(
    AppUserContext UserContext,
    Guid InvitationId);
