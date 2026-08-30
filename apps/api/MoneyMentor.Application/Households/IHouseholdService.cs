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

    Task<UpdateHouseholdSettingsResult> UpdateSettingsAsync(
        UpdateHouseholdSettingsCommand command,
        CancellationToken cancellationToken);

    Task<HouseholdInvitationResult> InviteMemberAsync(
        CreateHouseholdInvitationCommand command,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<HouseholdInvitationModel>> ListPendingInvitationsAsync(
        AppUserContext userContext,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<HouseholdInvitationModel>?> ListSentInvitationsAsync(
        AppUserContext userContext,
        Guid householdId,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyCollection<HouseholdInvitationModel>?>(null);

    Task<HouseholdInvitationResult> AcceptInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        CancellationToken cancellationToken);

    Task<HouseholdInvitationResult> DeclineInvitationAsync(
        RespondToHouseholdInvitationCommand command,
        CancellationToken cancellationToken);
}
