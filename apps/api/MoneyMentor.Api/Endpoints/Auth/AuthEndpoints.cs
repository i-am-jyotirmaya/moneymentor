using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Api.Production;
using MoneyMentor.Application.Registration;

namespace MoneyMentor.Api.Endpoints.Auth;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/auth")
            .WithTags("Auth");

        group.MapGet("/registration", (IOptions<RegistrationOptions> options, HttpContext context) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                return Results.Ok(new { options.Value.Mode });
            }).AllowAnonymous();

        group.MapPost("/access-requests", RequestAccessAsync)
            .AllowAnonymous().RequireRateLimiting(RateLimitPolicyNames.AccessRequest)
            .Produces(StatusCodes.Status202Accepted).ProducesValidationProblem();
        group.MapPost("/signup-invitations/validate", ValidateInvitationAsync)
            .AllowAnonymous().RequireRateLimiting(RateLimitPolicyNames.Session)
            .Produces<SignupInvitation>().Produces<AuthErrorResponse>(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPost("/users", CreateUserAsync)
            .AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Signup)
            .WithName("CreateAuthUser")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces<AuthErrorResponse>(StatusCodes.Status409Conflict)
            .Produces<AuthErrorResponse>(StatusCodes.Status403Forbidden)
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

    private static async Task<IResult> RequestAccessAsync(
        MvpAccessRequestBody request, IMvpAccessService service, CancellationToken cancellationToken)
    {
        var validation = EndpointValidation.Validate(request);
        if (validation is not null) return validation;
        await service.RequestAsync(request.Name, request.Email, request.Reason, cancellationToken);
        return Results.Accepted(value: new { Message = "Your request has been received. We’ll email you if access is approved." });
    }

    private static async Task<IResult> ValidateInvitationAsync(
        SignupInvitationValidationRequest request, IMvpAccessService service,
        HttpContext context, CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var validation = EndpointValidation.Validate(request);
        if (validation is not null) return validation;
        var invitation = await service.ValidateAsync(request.Token, cancellationToken);
        return invitation is null
            ? Results.Json(new AuthErrorResponse(["This signup link is invalid, expired, or already used. Contact support for help."]), statusCode: StatusCodes.Status403Forbidden)
            : Results.Ok(invitation);
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
