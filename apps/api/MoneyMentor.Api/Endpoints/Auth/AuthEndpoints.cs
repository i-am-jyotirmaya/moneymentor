using Microsoft.AspNetCore.Authorization;
using MoneyMentor.Api.Endpoints;

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
            .WithName("CreateAuthUser")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces<AuthErrorResponse>(StatusCodes.Status409Conflict)
            .ProducesValidationProblem();

        group.MapPost("/login", LoginAsync)
            .AllowAnonymous()
            .WithName("Login")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        group.MapPost("/refresh", RefreshAsync)
            .AllowAnonymous()
            .WithName("RefreshSession")
            .Produces<AuthSessionResponse>()
            .Produces<AuthErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        group.MapPost("/logout", LogoutAsync)
            .AllowAnonymous()
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
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var result = await authManager.CreateUserAsync(
            request,
            GetIpAddress(httpContext),
            cancellationToken);

        return AuthEndpointResults.ToResult(result);
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        IAuthManager authManager,
        HttpContext httpContext,
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

        return AuthEndpointResults.ToResult(result);
    }

    private static async Task<IResult> RefreshAsync(
        RefreshTokenRequest request,
        IAuthManager authManager,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var result = await authManager.RefreshAsync(
            request,
            GetIpAddress(httpContext),
            cancellationToken);

        return AuthEndpointResults.ToResult(result);
    }

    private static async Task<IResult> LogoutAsync(
        RefreshTokenRequest request,
        IAuthManager authManager,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var result = await authManager.LogoutAsync(
            request,
            GetIpAddress(httpContext),
            cancellationToken);

        return AuthEndpointResults.ToResult(result);
    }

    [Authorize]
    private static async Task<IResult> RevokeUserRefreshTokensAsync(
        IAuthManager authManager,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var result = await authManager.RevokeUserRefreshTokensAsync(
            httpContext.User,
            GetIpAddress(httpContext),
            cancellationToken);

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
}
