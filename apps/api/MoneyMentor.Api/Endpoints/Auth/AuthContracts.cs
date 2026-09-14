using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace MoneyMentor.Api.Endpoints.Auth;

public sealed class CreateUserRequest
{
    [MaxLength(128)]
    public string? InvitationToken { get; init; }

    [Required]
    [EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required]
    [MinLength(8)]
    public string Password { get; init; } = string.Empty;

    [Required]
    [MaxLength(128)]
    public string DisplayName { get; init; } = string.Empty;

    [Required]
    public string PrivacyPolicyVersion { get; init; } = string.Empty;

    public bool AcceptPrivacyPolicy { get; init; }
}

public sealed class LoginRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; init; } = string.Empty;

    [Required]
    public string Password { get; init; } = string.Empty;
}

public sealed record AuthSessionResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    AuthUserResponse User,
    bool RequiresPrivacyConsent = false)
{
    [JsonIgnore]
    public string RefreshToken { get; init; } = string.Empty;

    [JsonIgnore]
    public DateTimeOffset RefreshTokenExpiresAt { get; init; }

    [JsonIgnore]
    public Guid SessionId { get; init; }
}

public sealed record AuthUserResponse(
    Guid Id,
    string Email,
    string DisplayName,
    IReadOnlyCollection<string> Roles);

public sealed record AuthErrorResponse(IReadOnlyCollection<string> Errors);

public sealed class MvpAccessRequestBody
{
    [Required, MaxLength(128)]
    public string Name { get; init; } = string.Empty;

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [MaxLength(1000)]
    public string? Reason { get; init; }
}

public sealed class SignupInvitationValidationRequest
{
    [Required, MaxLength(128)]
    public string Token { get; init; } = string.Empty;
}
