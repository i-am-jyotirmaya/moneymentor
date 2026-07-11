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
    TransactionVisibility DefaultTransactionVisibility)
{
    public DateOnly CurrentDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);

    public bool HasCurrentPrivacyConsent { get; init; }
}
