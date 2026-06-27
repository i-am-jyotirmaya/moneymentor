using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.AppUsers;

public sealed record AppUserContext(
    Guid UserProfileId,
    Guid PersonalHouseholdId,
    string Email,
    string DisplayName,
    string CurrencyCode,
    string TimeZone,
    UserPlan Plan,
    bool RequireMerchantForExpenses,
    TransactionVisibility DefaultTransactionVisibility);
