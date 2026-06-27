using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Api.Endpoints;

internal static class AppUserIdentityFactory
{
    public static AppUserIdentity? FromPrincipal(ClaimsPrincipal principal)
    {
        var authSubject = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (string.IsNullOrWhiteSpace(authSubject))
        {
            return null;
        }

        var email = principal.FindFirstValue(ClaimTypes.Email)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Email);
        var displayName = principal.FindFirstValue(ClaimTypes.Name);

        return new AppUserIdentity(
            "local",
            authSubject,
            email,
            displayName);
    }
}
