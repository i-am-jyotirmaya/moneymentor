using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.AppUsers;

public sealed record UserSettingsModel(
    Guid UserProfileId,
    string Email,
    string DisplayName,
    string CurrencyCode,
    string TimeZone,
    UserPlan Plan,
    bool RequireMerchantForExpenses,
    TransactionVisibility DefaultTransactionVisibility);

public sealed record UpdateUserSettingsCommand(
    string? CurrencyCode,
    string? TimeZone,
    UserPlan? Plan,
    bool? RequireMerchantForExpenses,
    TransactionVisibility? DefaultTransactionVisibility);
