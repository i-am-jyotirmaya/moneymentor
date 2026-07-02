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

    Task<HouseholdInvitationResult> InviteMemberAsync(
        CreateHouseholdInvitationCommand command,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<HouseholdInvitationModel>> ListPendingInvitationsAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken);

    Task<HouseholdInvitationResult> AcceptInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        CancellationToken cancellationToken);

    Task<HouseholdInvitationResult> DeclineInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        CancellationToken cancellationToken);
}
