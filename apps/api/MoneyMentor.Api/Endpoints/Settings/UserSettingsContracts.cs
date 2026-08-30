using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace MoneyMentor.Api.Endpoints.Settings;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class UpdateUserSettingsRequest
{
    [MinLength(3)]
    [MaxLength(3)]
    public string? CurrencyCode { get; init; }

    [MaxLength(128)]
    public string? TimeZone { get; init; }

    public bool? RequireMerchantForExpenses { get; init; }

    [MaxLength(32)]
    public string? DefaultTransactionVisibility { get; init; }
}
