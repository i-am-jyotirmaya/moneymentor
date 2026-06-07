using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MoneyMentor.Api.Auth;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthManager _authManager;

    public AuthController(IAuthManager authManager)
    {
        _authManager = authManager;
    }

    [AllowAnonymous]
    [HttpPost("users")]
    public async Task<ActionResult<AuthSessionResponse>> CreateUser(
        CreateUserRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _authManager.CreateUserAsync(
            request,
            GetIpAddress(),
            cancellationToken);

        return ToActionResult(result);
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<AuthSessionResponse>> Login(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _authManager.LoginAsync(
            request,
            GetIpAddress(),
            cancellationToken);

        return ToActionResult(result);
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthSessionResponse>> Refresh(
        RefreshTokenRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _authManager.RefreshAsync(
            request,
            GetIpAddress(),
            cancellationToken);

        return ToActionResult(result);
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<ActionResult> Logout(
        RefreshTokenRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _authManager.LogoutAsync(
            request,
            GetIpAddress(),
            cancellationToken);

        return ToActionResult(result);
    }

    [Authorize]
    [HttpPost("refresh-tokens/revoke")]
    public async Task<ActionResult> RevokeUserRefreshTokens(CancellationToken cancellationToken)
    {
        var result = await _authManager.RevokeUserRefreshTokensAsync(
            User,
            GetIpAddress(),
            cancellationToken);

        return ToActionResult(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<AuthUserResponse>> GetCurrentUser(CancellationToken cancellationToken)
    {
        var result = await _authManager.GetCurrentUserAsync(User, cancellationToken);

        return ToActionResult(result);
    }

    private string? GetIpAddress() =>
        HttpContext.Connection.RemoteIpAddress?.ToString();

    private ActionResult<T> ToActionResult<T>(AuthManagerResult<T> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Ok(result.Value);
        }

        return ToErrorActionResult(result.FailureKind, result.Errors);
    }

    private ActionResult ToActionResult(AuthManagerResult result)
    {
        if (result.Succeeded)
        {
            return NoContent();
        }

        return ToErrorActionResult(result.FailureKind, result.Errors);
    }

    private ActionResult ToErrorActionResult(
        AuthFailureKind failureKind,
        IReadOnlyCollection<string> errors)
    {
        var response = new AuthErrorResponse(errors);

        return failureKind switch
        {
            AuthFailureKind.Conflict => Conflict(response),
            AuthFailureKind.InvalidCredentials => Unauthorized(response),
            AuthFailureKind.Unauthorized => Unauthorized(response),
            AuthFailureKind.NotFound => NotFound(response),
            _ => BadRequest(response)
        };
    }
}
