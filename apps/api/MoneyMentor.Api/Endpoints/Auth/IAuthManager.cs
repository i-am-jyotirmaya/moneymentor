using System.Security.Claims;

namespace MoneyMentor.Api.Endpoints.Auth;

public interface IAuthManager
{
    Task<AuthManagerResult<AuthSessionResponse>> CreateUserAsync(
        CreateUserRequest request,
        string? ipAddress,
        CancellationToken cancellationToken);

    Task<AuthManagerResult<AuthSessionResponse>> LoginAsync(
        LoginRequest request,
        string? ipAddress,
        CancellationToken cancellationToken);

    Task<AuthManagerResult<AuthSessionResponse>> RefreshAsync(
        RefreshTokenRequest request,
        string? ipAddress,
        CancellationToken cancellationToken);

    Task<AuthManagerResult> LogoutAsync(
        RefreshTokenRequest request,
        string? ipAddress,
        CancellationToken cancellationToken);

    Task<AuthManagerResult> RevokeUserRefreshTokensAsync(
        ClaimsPrincipal principal,
        string? ipAddress,
        CancellationToken cancellationToken);

    Task<AuthManagerResult<AuthUserResponse>> GetCurrentUserAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken);
}
