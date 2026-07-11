using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Households;

public sealed class HouseholdInvitationPolicyTests
{
    [Theory]
    [InlineData(UserPlan.Free, HouseholdRole.Owner)]
    [InlineData(UserPlan.Premium, HouseholdRole.Admin)]
    public void CanManageInvitations_AllowsActiveManagersRegardlessOfPersonalPlan(
        UserPlan plan,
        HouseholdRole role)
    {
        var result = HouseholdInvitationPolicy.CanManageInvitations(
            plan,
            role,
            HouseholdMemberStatus.Active);

        Assert.True(result);
    }

    [Theory]
    [InlineData(UserPlan.Premium, HouseholdRole.Member, HouseholdMemberStatus.Active)]
    [InlineData(UserPlan.Premium, HouseholdRole.Viewer, HouseholdMemberStatus.Active)]
    [InlineData(UserPlan.Premium, HouseholdRole.Owner, HouseholdMemberStatus.Removed)]
    public void CanManageInvitations_RejectsUnauthorizedUsers(
        UserPlan plan,
        HouseholdRole role,
        HouseholdMemberStatus status)
    {
        var result = HouseholdInvitationPolicy.CanManageInvitations(plan, role, status);

        Assert.False(result);
    }

    [Theory]
    [InlineData(HouseholdRole.Admin, true)]
    [InlineData(HouseholdRole.Member, true)]
    [InlineData(HouseholdRole.Viewer, true)]
    [InlineData(HouseholdRole.Owner, false)]
    public void CanAssignRole_OnlyAllowsNonOwnerRoles(HouseholdRole role, bool expected)
    {
        Assert.Equal(expected, HouseholdInvitationPolicy.CanAssignRole(role));
    }

    [Fact]
    public void NormalizeEmail_TrimsAndLowercases()
    {
        Assert.Equal(
            "friend@example.com",
            HouseholdInvitationPolicy.NormalizeEmail("  Friend@Example.COM "));
    }

    [Fact]
    public void HasExpired_TreatsTheExpiryInstantAsExpired()
    {
        var now = new DateTimeOffset(2026, 7, 2, 10, 0, 0, TimeSpan.Zero);

        Assert.True(HouseholdInvitationPolicy.HasExpired(now, now));
        Assert.False(HouseholdInvitationPolicy.HasExpired(now.AddTicks(1), now));
    }
}
