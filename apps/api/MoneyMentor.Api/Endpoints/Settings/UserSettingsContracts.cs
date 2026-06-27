using System.ComponentModel.DataAnnotations;

namespace MoneyMentor.Api.Endpoints.Settings;

public sealed class UpdateUserSettingsRequest
{
    [MinLength(3)]
    [MaxLength(3)]
    public string? CurrencyCode { get; init; }

    [MaxLength(128)]
    public string? TimeZone { get; init; }

    [MaxLength(32)]
    public string? Plan { get; init; }

    public bool? RequireMerchantForExpenses { get; init; }

    [MaxLength(32)]
    public string? DefaultTransactionVisibility { get; init; }
}
