using System.Text;

namespace MoneyMentor.Api.Auth;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; init; } = "MoneyMentor";

    public string Audience { get; init; } = "MoneyMentor.Api";

    public string SigningKey { get; init; } = string.Empty;

    public int AccessTokenMinutes { get; init; } = 15;

    public int RefreshTokenDays { get; init; } = 30;

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Issuer))
        {
            throw new InvalidOperationException("JWT issuer is not configured.");
        }

        if (string.IsNullOrWhiteSpace(Audience))
        {
            throw new InvalidOperationException("JWT audience is not configured.");
        }

        if (Encoding.UTF8.GetByteCount(SigningKey) < 32)
        {
            throw new InvalidOperationException("JWT signing key must be at least 32 bytes.");
        }

        if (AccessTokenMinutes <= 0)
        {
            throw new InvalidOperationException("JWT access token lifetime must be positive.");
        }

        if (RefreshTokenDays <= 0)
        {
            throw new InvalidOperationException("Refresh token lifetime must be positive.");
        }
    }
}
