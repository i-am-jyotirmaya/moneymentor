using System.ComponentModel.DataAnnotations;

namespace MoneyMentor.Api.Endpoints.Privacy;

public sealed record PrivacyPolicyResponse(
    string Version,
    string EffectiveDate,
    string PolicyUrl,
    string SupportEmail);

public sealed class AcceptPrivacyConsentRequest
{
    [Required]
    public string PolicyVersion { get; init; } = string.Empty;

    public bool Accepted { get; init; }
}

public sealed class DeleteAccountRequest
{
    [Required]
    public string Password { get; init; } = string.Empty;

    [Required]
    public string Confirmation { get; init; } = string.Empty;
}

public sealed class ProductOptions
{
    public const string SectionName = "Product";

    public string PublicWebUrl { get; init; } = "http://localhost:3000";

    public string SupportEmail { get; init; } = string.Empty;
}
