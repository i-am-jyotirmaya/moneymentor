using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Households;

public sealed record HouseholdSummaryModel(
    Guid Id,
    string Name,
    HouseholdKind Kind,
    HouseholdRole Role,
    HouseholdMemberStatus Status,
    int MemberCount,
    DateTimeOffset CreatedAt);

public sealed record HouseholdDashboardModel(
    UserPlan Plan,
    bool CanUseHouseholds,
    IReadOnlyCollection<HouseholdSummaryModel> Households);

public sealed record CreateHouseholdCommand(
    AppUserContext UserContext,
    string Name);

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
    DateTimeOffset? RespondedAt);

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
