using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Households;

public static class HouseholdInvitationPolicy
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public static bool CanManageInvitations(
        UserPlan _,
        HouseholdRole? role,
        HouseholdMemberStatus? status) =>
        status == HouseholdMemberStatus.Active
        && role is HouseholdRole.Owner or HouseholdRole.Admin;

    public static bool CanAssignRole(HouseholdRole role) =>
        role is HouseholdRole.Admin or HouseholdRole.Member or HouseholdRole.Viewer;

    public static string NormalizeEmail(string email) =>
        email.Trim().ToLowerInvariant();

    public static bool HasExpired(DateTimeOffset expiresAt, DateTimeOffset now) =>
        expiresAt <= now;
}
