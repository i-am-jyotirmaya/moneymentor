namespace MoneyMentor.Api.Endpoints.Auth;

public sealed class AuthCookieOptions
{
    public const string SectionName = "AuthCookie";
    public const string RefreshCookieName = "mm_refresh";
    public const string SessionCookieName = "mm_session";

    public bool Secure { get; init; } = true;

    public string SameSite { get; init; } = "Strict";

    public string? Domain { get; init; }

    public SameSiteMode GetSameSiteMode() => SameSite.ToLowerInvariant() switch
    {
        "none" => SameSiteMode.None,
        "lax" => SameSiteMode.Lax,
        _ => SameSiteMode.Strict
    };

    public CookieOptions Build(DateTimeOffset expiresAt) => new()
    {
        HttpOnly = true,
        Secure = Secure,
        SameSite = GetSameSiteMode(),
        Domain = string.IsNullOrWhiteSpace(Domain) ? null : Domain,
        Path = "/api/auth",
        Expires = expiresAt,
        IsEssential = true
    };
}
