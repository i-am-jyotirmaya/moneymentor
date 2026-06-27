using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Application.Households;

public interface IHouseholdService
{
    Task<HouseholdDashboardModel> ListAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken);

    Task<HouseholdSummaryModel?> CreateFamilyHouseholdAsync(
        CreateHouseholdCommand command,
        CancellationToken cancellationToken);

    Task<HouseholdSummaryModel?> AddMemberAsync(
        AddHouseholdMemberCommand command,
        CancellationToken cancellationToken);
}
