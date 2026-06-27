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

public sealed record AddHouseholdMemberCommand(
    AppUserContext UserContext,
    Guid HouseholdId,
    string Email,
    HouseholdRole Role);
