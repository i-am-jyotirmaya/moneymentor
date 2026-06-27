using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Households;

internal sealed class PostgresHouseholdService(
    MoneyMentorDbContext dbContext) : IHouseholdService
{
    public async Task<HouseholdDashboardModel> ListAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken)
    {
        var memberships = await LoadMembershipSummariesAsync(
            userContext.UserProfileId,
            includePersonal: false,
            cancellationToken);

        return new HouseholdDashboardModel(
            userContext.Plan,
            userContext.Plan == UserPlan.Premium,
            memberships);
    }

    public async Task<HouseholdSummaryModel?> CreateFamilyHouseholdAsync(
        CreateHouseholdCommand command,
        CancellationToken cancellationToken)
    {
        if (command.UserContext.Plan != UserPlan.Premium)
        {
            return null;
        }

        var name = command.Name.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        var household = new Household
        {
            Name = name,
            Kind = HouseholdKind.Family,
            CreatedByUserProfileId = command.UserContext.UserProfileId
        };

        var member = new HouseholdMember
        {
            HouseholdId = household.Id,
            UserProfileId = command.UserContext.UserProfileId,
            Role = HouseholdRole.Owner,
            Status = HouseholdMemberStatus.Active
        };

        dbContext.Households.Add(household);
        dbContext.HouseholdMembers.Add(member);

        await dbContext.SaveChangesAsync(cancellationToken);

        return new HouseholdSummaryModel(
            household.Id,
            household.Name,
            household.Kind,
            member.Role,
            member.Status,
            1,
            household.CreatedAt);
    }

    public async Task<HouseholdSummaryModel?> AddMemberAsync(
        AddHouseholdMemberCommand command,
        CancellationToken cancellationToken)
    {
        if (command.UserContext.Plan != UserPlan.Premium)
        {
            return null;
        }

        var currentMember = await dbContext.HouseholdMembers
            .FirstOrDefaultAsync(
                member => member.HouseholdId == command.HouseholdId
                    && member.UserProfileId == command.UserContext.UserProfileId
                    && member.Status == HouseholdMemberStatus.Active,
                cancellationToken);

        if (currentMember?.Role is not (HouseholdRole.Owner or HouseholdRole.Admin))
        {
            return null;
        }

        var household = await dbContext.Households
            .FirstOrDefaultAsync(
                item => item.Id == command.HouseholdId
                    && item.Kind == HouseholdKind.Family,
                cancellationToken);

        if (household is null)
        {
            return null;
        }

        var email = command.Email.Trim().ToLowerInvariant();
        var userProfile = await dbContext.UserProfiles
            .FirstOrDefaultAsync(
                profile => profile.Email.ToLower() == email,
                cancellationToken);

        if (userProfile is null)
        {
            return null;
        }

        var existingMember = await dbContext.HouseholdMembers
            .FirstOrDefaultAsync(
                member => member.HouseholdId == household.Id
                    && member.UserProfileId == userProfile.Id,
                cancellationToken);

        if (existingMember is null)
        {
            dbContext.HouseholdMembers.Add(new HouseholdMember
            {
                HouseholdId = household.Id,
                UserProfileId = userProfile.Id,
                Role = command.Role,
                Status = HouseholdMemberStatus.Active
            });
        }
        else
        {
            existingMember.Role = command.Role;
            existingMember.Status = HouseholdMemberStatus.Active;
        }

        household.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        var summaries = await LoadMembershipSummariesAsync(
            command.UserContext.UserProfileId,
            includePersonal: false,
            cancellationToken);

        return summaries.FirstOrDefault(item => item.Id == household.Id);
    }

    private async Task<IReadOnlyCollection<HouseholdSummaryModel>> LoadMembershipSummariesAsync(
        Guid userProfileId,
        bool includePersonal,
        CancellationToken cancellationToken)
    {
        var rows = await dbContext.HouseholdMembers
            .Where(member => member.UserProfileId == userProfileId
                && member.Status == HouseholdMemberStatus.Active)
            .Join(
                dbContext.Households,
                member => member.HouseholdId,
                household => household.Id,
                (member, household) => new { Member = member, Household = household })
            .Where(item => includePersonal || item.Household.Kind != HouseholdKind.Personal)
            .OrderBy(item => item.Household.Name)
            .ToListAsync(cancellationToken);

        var householdIds = rows.Select(item => item.Household.Id).ToArray();
        var memberCounts = await dbContext.HouseholdMembers
            .Where(member => householdIds.Contains(member.HouseholdId)
                && member.Status == HouseholdMemberStatus.Active)
            .GroupBy(member => member.HouseholdId)
            .Select(group => new { HouseholdId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.HouseholdId, item => item.Count, cancellationToken);

        return rows
            .Select(item => new HouseholdSummaryModel(
                item.Household.Id,
                item.Household.Name,
                item.Household.Kind,
                item.Member.Role,
                item.Member.Status,
                memberCounts.GetValueOrDefault(item.Household.Id),
                item.Household.CreatedAt))
            .ToArray();
    }
}
