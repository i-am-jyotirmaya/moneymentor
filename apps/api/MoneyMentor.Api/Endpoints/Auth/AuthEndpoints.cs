using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Api.Production;

namespace MoneyMentor.Api.Endpoints.Auth;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/auth")
            .WithTags("Auth");

        group.MapPost("/users", CreateUserAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Signup)
            .WithName("CreateAuthUser")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces<AuthErrorResponse>(StatusCodes.Status409Conflict)
            .ProducesValidationProblem();

        group.MapPost("/login", LoginAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Login)
            .WithName("Login")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        group.MapPost("/refresh", RefreshAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Session)
            .WithName("RefreshSession")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        group.MapPost("/logout", LogoutAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Session)
            .WithName("Logout")
            .Produces(StatusCodes.Status204NoContent)
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .ProducesValidationProblem();

        group.MapPost("/refresh-tokens/revoke", RevokeUserRefreshTokensAsync)
            .RequireAuthorization()
            .WithName("RevokeUserRefreshTokens")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status401Unauthorized);

        group.MapGet("/me", GetCurrentUserAsync)
            .RequireAuthorization()
            .WithName("GetCurrentAuthUser")
            .Produces<AuthUserResponse>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces<AuthErrorResponse>(StatusCodes.Status404NotFound);

        return group;
    }

    private static async Task<IResult> CreateUserAsync(
        CreateUserRequest request,
        IAuthManager authManager,
        HttpContext httpContext,
        IOptions<AuthCookieOptions> cookieOptions,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        if (!request.AcceptPrivacyPolicy
            || !string.Equals(
                request.PrivacyPolicyVersion,
                PrivacyPolicy.CurrentVersion,
                StringComparison.Ordinal))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.PrivacyPolicyVersion),
                "The current privacy policy must be accepted before signup.");
        }

        var result = await authManager.CreateUserAsync(
            request,
            GetIpAddress(httpContext),
            cancellationToken);

        return ToSessionResult(result, httpContext, cookieOptions.Value);
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        IAuthManager authManager,
        HttpContext httpContext,
        IOptions<AuthCookieOptions> cookieOptions,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var result = await authManager.LoginAsync(
            request,
            GetIpAddress(httpContext),
            cancellationToken);

        return ToSessionResult(result, httpContext, cookieOptions.Value);
    }

    private static async Task<IResult> RefreshAsync(
        IAuthManager authManager,
        HttpContext httpContext,
        IOptions<AuthCookieOptions> cookieOptions,
        CancellationToken cancellationToken)
    {
        if (!httpContext.Request.Cookies.TryGetValue(
                AuthCookieOptions.RefreshCookieName,
                out var refreshToken)
            || string.IsNullOrWhiteSpace(refreshToken))
        {
            return Results.Unauthorized();
        }

        var result = await authManager.RefreshAsync(
            refreshToken,
            GetIpAddress(httpContext),
            cancellationToken);

        if (!result.Succeeded)
        {
            DeleteRefreshCookie(httpContext, cookieOptions.Value);
        }

        return ToSessionResult(result, httpContext, cookieOptions.Value);
    }

    private static async Task<IResult> LogoutAsync(
        IAuthManager authManager,
        HttpContext httpContext,
        IOptions<AuthCookieOptions> cookieOptions,
        CancellationToken cancellationToken)
    {
        if (httpContext.Request.Cookies.TryGetValue(
                AuthCookieOptions.RefreshCookieName,
                out var refreshToken)
            && !string.IsNullOrWhiteSpace(refreshToken))
        {
            await authManager.LogoutAsync(
                refreshToken,
                GetIpAddress(httpContext),
                cancellationToken);
        }

        DeleteRefreshCookie(httpContext, cookieOptions.Value);
        return Results.NoContent();
    }

    [Authorize]
    private static async Task<IResult> RevokeUserRefreshTokensAsync(
        IAuthManager authManager,
        HttpContext httpContext,
        IOptions<AuthCookieOptions> cookieOptions,
        CancellationToken cancellationToken)
    {
        var result = await authManager.RevokeUserRefreshTokensAsync(
            httpContext.User,
            GetIpAddress(httpContext),
            cancellationToken);

        if (result.Succeeded)
        {
            DeleteRefreshCookie(httpContext, cookieOptions.Value);
        }

        return AuthEndpointResults.ToResult(result);
    }

    [Authorize]
    private static async Task<IResult> GetCurrentUserAsync(
        IAuthManager authManager,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var result = await authManager.GetCurrentUserAsync(
            httpContext.User,
            cancellationToken);

        return AuthEndpointResults.ToResult(result);
    }

    private static string? GetIpAddress(HttpContext httpContext) =>
        httpContext.Connection.RemoteIpAddress?.ToString();

    private static IResult ToSessionResult(
        AuthManagerResult<AuthSessionResponse> result,
        HttpContext httpContext,
        AuthCookieOptions cookieOptions)
    {
        if (!result.Succeeded || result.Value is null)
        {
            return AuthEndpointResults.ToResult(result);
        }

        httpContext.Response.Cookies.Append(
            AuthCookieOptions.RefreshCookieName,
            result.Value.RefreshToken,
            cookieOptions.Build(result.Value.RefreshTokenExpiresAt));
        httpContext.Response.Cookies.Append(
            AuthCookieOptions.SessionCookieName,
            result.Value.SessionId.ToString(),
            cookieOptions.Build(result.Value.RefreshTokenExpiresAt));
        return Results.Ok(result.Value);
    }

    private static void DeleteRefreshCookie(
        HttpContext httpContext,
        AuthCookieOptions cookieOptions)
    {
        httpContext.Response.Cookies.Delete(
            AuthCookieOptions.RefreshCookieName,
            cookieOptions.Build(DateTimeOffset.UnixEpoch));
        httpContext.Response.Cookies.Delete(
            AuthCookieOptions.SessionCookieName,
            cookieOptions.Build(DateTimeOffset.UnixEpoch));
    }
}
