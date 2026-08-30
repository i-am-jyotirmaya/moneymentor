using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Households;

internal sealed class PostgresHouseholdAccessService(
    MoneyMentorDbContext dbContext) : IHouseholdAccessService
{
    public async Task<HouseholdAccessContext> ResolveAsync(
        AppUserContext userContext,
        Guid? requestedHouseholdId,
        bool requireWrite,
        CancellationToken cancellationToken)
    {
        var householdId = requestedHouseholdId ?? userContext.PersonalHouseholdId;
        var access = await dbContext.HouseholdMembers
            .AsNoTracking()
            .Where(member => member.HouseholdId == householdId
                && member.UserProfileId == userContext.UserProfileId
                && member.Status == HouseholdMemberStatus.Active)
            .Join(
                dbContext.Households,
                member => member.HouseholdId,
                household => household.Id,
                (member, household) => new { member.Role, household.Kind, household.CurrencyCode, household.TimeZone })
            .Select(row => new HouseholdAccessContext(
                householdId,
                row.Kind,
                row.Role,
                row.Role != HouseholdRole.Viewer,
                row.CurrencyCode,
                row.TimeZone))
            .SingleOrDefaultAsync(cancellationToken);

        if (access is null)
        {
            throw new HouseholdNotFoundException();
        }

        if (requireWrite && !access.CanWrite)
        {
            throw new HouseholdWriteForbiddenException();
        }

        return access;
    }
}
