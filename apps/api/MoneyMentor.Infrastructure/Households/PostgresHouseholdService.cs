using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
using Npgsql;

namespace MoneyMentor.Infrastructure.Households;

internal sealed class PostgresHouseholdService(
    MoneyMentorDbContext dbContext,
    TimeProvider timeProvider) : IHouseholdService
{
    public async Task<HouseholdDashboardModel> ListAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken)
    {
        var memberships = await LoadMembershipSummariesAsync(
            userContext,
            includePersonal: true,
            cancellationToken);

        return new HouseholdDashboardModel(
            userContext.Plan,
            userContext.Plan == UserPlan.Premium,
            userContext.PersonalHouseholdId,
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

        var now = timeProvider.GetUtcNow();
        var household = new Household
        {
            Name = name,
            Kind = HouseholdKind.Family,
            CreatedByUserProfileId = command.UserContext.UserProfileId,
            CreatedAt = now,
            UpdatedAt = now
        };

        var member = new HouseholdMember
        {
            HouseholdId = household.Id,
            UserProfileId = command.UserContext.UserProfileId,
            Role = HouseholdRole.Owner,
            Status = HouseholdMemberStatus.Active,
            JoinedAt = now
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
            true,
            1,
            household.CreatedAt);
    }

    public async Task<HouseholdInvitationResult> InviteMemberAsync(
        CreateHouseholdInvitationCommand command,
        CancellationToken cancellationToken)
    {
        if (!HouseholdInvitationPolicy.CanAssignRole(command.Role))
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.InvalidRole);
        }

        var currentMember = await dbContext.HouseholdMembers
            .FirstOrDefaultAsync(
                member => member.HouseholdId == command.HouseholdId
                    && member.UserProfileId == command.UserContext.UserProfileId,
                cancellationToken);

        if (currentMember is null || currentMember.Status != HouseholdMemberStatus.Active)
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.NotFound);
        }

        if (!HouseholdInvitationPolicy.CanManageInvitations(
                command.UserContext.Plan,
                currentMember?.Role,
                currentMember?.Status))
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.Forbidden);
        }

        var household = await dbContext.Households
            .FirstOrDefaultAsync(
                item => item.Id == command.HouseholdId
                    && item.Kind == HouseholdKind.Family,
                cancellationToken);

        if (household is null)
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.NotFound);
        }

        var email = HouseholdInvitationPolicy.NormalizeEmail(command.Email);
        var userProfile = await dbContext.UserProfiles
            .FirstOrDefaultAsync(
                profile => profile.Email.ToLower() == email,
                cancellationToken);

        if (userProfile is not null)
        {
            var existingMember = await dbContext.HouseholdMembers
                .FirstOrDefaultAsync(
                    member => member.HouseholdId == household.Id
                        && member.UserProfileId == userProfile.Id,
                    cancellationToken);

            if (existingMember is not null
                && existingMember.Status != HouseholdMemberStatus.Removed)
            {
                return new HouseholdInvitationResult(HouseholdInvitationResultStatus.Conflict);
            }
        }

        var now = timeProvider.GetUtcNow();
        var invitation = await dbContext.HouseholdInvitations
            .FirstOrDefaultAsync(
                item => item.HouseholdId == household.Id
                    && item.Email == email
                    && item.Status == HouseholdInvitationStatus.Pending,
                cancellationToken);

        if (invitation is not null
            && invitation.Status == HouseholdInvitationStatus.Pending
            && invitation.ExpiresAt > now)
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.Conflict);
        }

        if (invitation is not null)
        {
            invitation.Status = HouseholdInvitationStatus.Expired;
            invitation.DeliveryStatus = invitation.DeliveryStatus == InvitationDeliveryStatus.Sent
                ? invitation.DeliveryStatus
                : InvitationDeliveryStatus.Failed;
            invitation.LastDeliveryError ??= "Invitation expired before delivery completed.";
            invitation.NextDeliveryAttemptAt = null;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        invitation = new HouseholdInvitation
        {
            HouseholdId = household.Id,
            InvitedByUserProfileId = command.UserContext.UserProfileId,
            Email = email,
            Role = command.Role,
            Status = HouseholdInvitationStatus.Pending,
            CreatedAt = now,
            ExpiresAt = now.Add(HouseholdInvitationPolicy.Lifetime),
            DeliveryStatus = InvitationDeliveryStatus.Queued,
            NextDeliveryAttemptAt = now
        };
        dbContext.HouseholdInvitations.Add(invitation);

        household.UpdatedAt = now;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation
            })
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.Conflict);
        }

        return new HouseholdInvitationResult(
            HouseholdInvitationResultStatus.Succeeded,
            MapInvitation(
                invitation,
                household.Name,
                command.UserContext.DisplayName));
    }

    public async Task<IReadOnlyCollection<HouseholdInvitationModel>> ListPendingInvitationsAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken)
    {
        var email = HouseholdInvitationPolicy.NormalizeEmail(userContext.Email);
        var now = timeProvider.GetUtcNow();

        return await dbContext.HouseholdInvitations
            .Where(invitation => invitation.Email == email
                && invitation.Status == HouseholdInvitationStatus.Pending
                && invitation.ExpiresAt > now)
            .Join(
                dbContext.Households,
                invitation => invitation.HouseholdId,
                household => household.Id,
                (invitation, household) => new { Invitation = invitation, Household = household })
            .Join(
                dbContext.UserProfiles,
                row => row.Invitation.InvitedByUserProfileId,
                profile => profile.Id,
                (row, profile) => new
                {
                    row.Invitation,
                    HouseholdName = row.Household.Name,
                    InvitedByDisplayName = profile.DisplayName
                })
            .OrderByDescending(row => row.Invitation.CreatedAt)
            .Select(row => new HouseholdInvitationModel(
                row.Invitation.Id,
                row.Invitation.HouseholdId,
                row.HouseholdName,
                row.Invitation.Email,
                row.Invitation.Role,
                row.Invitation.Status,
                row.InvitedByDisplayName,
                row.Invitation.CreatedAt,
                row.Invitation.ExpiresAt,
                row.Invitation.RespondedAt,
                row.Invitation.DeliveryStatus,
                row.Invitation.DeliveryAttemptCount,
                row.Invitation.SentAt,
                row.Invitation.LastDeliveryError))
            .ToArrayAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<HouseholdInvitationModel>?> ListSentInvitationsAsync(
        AppUserContext userContext,
        Guid householdId,
        CancellationToken cancellationToken)
    {
        var membership = await dbContext.HouseholdMembers.AsNoTracking().FirstOrDefaultAsync(
            member => member.HouseholdId == householdId
                && member.UserProfileId == userContext.UserProfileId,
            cancellationToken);
        if (!HouseholdInvitationPolicy.CanManageInvitations(
                userContext.Plan,
                membership?.Role,
                membership?.Status))
        {
            return null;
        }

        return await BuildSentInvitationsQuery(dbContext, householdId)
            .ToArrayAsync(cancellationToken);
    }

    internal static IQueryable<HouseholdInvitationModel> BuildSentInvitationsQuery(
        MoneyMentorDbContext dbContext,
        Guid householdId)
    {
        return dbContext.HouseholdInvitations.AsNoTracking()
            .Where(invitation => invitation.HouseholdId == householdId)
            .Join(
                dbContext.Households,
                invitation => invitation.HouseholdId,
                household => household.Id,
                (invitation, household) => new { Invitation = invitation, Household = household })
            .Join(
                dbContext.UserProfiles,
                row => row.Invitation.InvitedByUserProfileId,
                profile => profile.Id,
                (row, profile) => new
                {
                    row.Invitation,
                    HouseholdName = row.Household.Name,
                    InvitedByDisplayName = profile.DisplayName
                })
            .OrderByDescending(row => row.Invitation.CreatedAt)
            .Select(row => new HouseholdInvitationModel(
                    row.Invitation.Id,
                    row.Invitation.HouseholdId,
                    row.HouseholdName,
                    row.Invitation.Email,
                    row.Invitation.Role,
                    row.Invitation.Status,
                    row.InvitedByDisplayName,
                    row.Invitation.CreatedAt,
                    row.Invitation.ExpiresAt,
                    row.Invitation.RespondedAt,
                    row.Invitation.DeliveryStatus,
                    row.Invitation.DeliveryAttemptCount,
                    row.Invitation.SentAt,
                    row.Invitation.LastDeliveryError));
    }

    public Task<HouseholdInvitationResult> AcceptInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        CancellationToken cancellationToken) =>
        RespondToInvitationAsync(command, accept: true, cancellationToken);

    public Task<HouseholdInvitationResult> DeclineInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        CancellationToken cancellationToken) =>
        RespondToInvitationAsync(command, accept: false, cancellationToken);

    private async Task<HouseholdInvitationResult> RespondToInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        bool accept,
        CancellationToken cancellationToken)
    {
        var email = HouseholdInvitationPolicy.NormalizeEmail(command.UserContext.Email);
        var invitation = await dbContext.HouseholdInvitations
            .FirstOrDefaultAsync(
                item => item.Id == command.InvitationId
                    && item.Email == email,
                cancellationToken);

        if (invitation is null)
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.NotFound);
        }

        if (invitation.Status != HouseholdInvitationStatus.Pending)
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.Conflict);
        }

        var now = timeProvider.GetUtcNow();
        if (HouseholdInvitationPolicy.HasExpired(invitation.ExpiresAt, now))
        {
            invitation.Status = HouseholdInvitationStatus.Expired;
            invitation.RespondedAt = now;
            invitation.RespondedByUserProfileId = command.UserContext.UserProfileId;
            await dbContext.SaveChangesAsync(cancellationToken);

            return new HouseholdInvitationResult(
                HouseholdInvitationResultStatus.Expired,
                await LoadInvitationModelAsync(invitation.Id, cancellationToken));
        }

        if (accept)
        {
            var membership = await dbContext.HouseholdMembers
                .FirstOrDefaultAsync(
                    member => member.HouseholdId == invitation.HouseholdId
                        && member.UserProfileId == command.UserContext.UserProfileId,
                    cancellationToken);

            if (membership is null)
            {
                dbContext.HouseholdMembers.Add(new HouseholdMember
                {
                    HouseholdId = invitation.HouseholdId,
                    UserProfileId = command.UserContext.UserProfileId,
                    Role = invitation.Role,
                    Status = HouseholdMemberStatus.Active,
                    JoinedAt = now
                });
            }
            else if (membership.Status != HouseholdMemberStatus.Active)
            {
                membership.Role = invitation.Role;
                membership.Status = HouseholdMemberStatus.Active;
                membership.JoinedAt = now;
            }

            invitation.Status = HouseholdInvitationStatus.Accepted;

            var household = await dbContext.Households
                .FirstAsync(
                    item => item.Id == invitation.HouseholdId,
                    cancellationToken);
            household.UpdatedAt = now;
        }
        else
        {
            invitation.Status = HouseholdInvitationStatus.Declined;
        }

        invitation.RespondedAt = now;
        invitation.RespondedByUserProfileId = command.UserContext.UserProfileId;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
            when (exception.InnerException is PostgresException
            {
                SqlState: PostgresErrorCodes.UniqueViolation
            })
        {
            return new HouseholdInvitationResult(HouseholdInvitationResultStatus.Conflict);
        }

        return new HouseholdInvitationResult(
            HouseholdInvitationResultStatus.Succeeded,
            await LoadInvitationModelAsync(invitation.Id, cancellationToken));
    }

    private async Task<HouseholdInvitationModel?> LoadInvitationModelAsync(
        Guid invitationId,
        CancellationToken cancellationToken)
    {
        return await dbContext.HouseholdInvitations
            .Where(invitation => invitation.Id == invitationId)
            .Join(
                dbContext.Households,
                invitation => invitation.HouseholdId,
                household => household.Id,
                (invitation, household) => new { Invitation = invitation, Household = household })
            .Join(
                dbContext.UserProfiles,
                row => row.Invitation.InvitedByUserProfileId,
                profile => profile.Id,
                (row, profile) => new HouseholdInvitationModel(
                    row.Invitation.Id,
                    row.Invitation.HouseholdId,
                    row.Household.Name,
                    row.Invitation.Email,
                    row.Invitation.Role,
                    row.Invitation.Status,
                    profile.DisplayName,
                    row.Invitation.CreatedAt,
                    row.Invitation.ExpiresAt,
                    row.Invitation.RespondedAt,
                    row.Invitation.DeliveryStatus,
                    row.Invitation.DeliveryAttemptCount,
                    row.Invitation.SentAt,
                    row.Invitation.LastDeliveryError))
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static HouseholdInvitationModel MapInvitation(
        HouseholdInvitation invitation,
        string householdName,
        string invitedByDisplayName) =>
        new(
            invitation.Id,
            invitation.HouseholdId,
            householdName,
            invitation.Email,
            invitation.Role,
            invitation.Status,
            invitedByDisplayName,
            invitation.CreatedAt,
            invitation.ExpiresAt,
            invitation.RespondedAt,
            invitation.DeliveryStatus,
            invitation.DeliveryAttemptCount,
            invitation.SentAt,
            invitation.LastDeliveryError);

    private async Task<IReadOnlyCollection<HouseholdSummaryModel>> LoadMembershipSummariesAsync(
        AppUserContext userContext,
        bool includePersonal,
        CancellationToken cancellationToken)
    {
        var rows = await dbContext.HouseholdMembers
            .Where(member => member.UserProfileId == userContext.UserProfileId
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
                item.Member.Role != HouseholdRole.Viewer,
                memberCounts.GetValueOrDefault(item.Household.Id),
                item.Household.CreatedAt))
            .ToArray();
    }
}
