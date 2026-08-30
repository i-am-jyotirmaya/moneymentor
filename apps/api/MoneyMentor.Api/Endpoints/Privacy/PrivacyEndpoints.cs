using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Api.Production;
using MoneyMentor.Api.Endpoints.Auth;

namespace MoneyMentor.Api.Endpoints.Privacy;

public static class PrivacyEndpoints
{
    public static IEndpointRouteBuilder MapPrivacyEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/public/privacy", GetPolicy)
            .AllowAnonymous()
            .WithTags("Privacy")
            .WithName("GetPrivacyPolicy")
            .Produces<PrivacyPolicyResponse>();

        var group = endpoints.MapGroup("/api/privacy")
            .RequireAuthorization()
            .WithTags("Privacy");
        group.MapPost("/consents", AcceptConsentAsync)
            .WithName("AcceptPrivacyConsent")
            .Produces<PrivacyConsentModel>()
            .ProducesValidationProblem();
        group.MapGet("/export", ExportAsync)
            .RequireRateLimiting(RateLimitPolicyNames.Privacy)
            .WithName("ExportPersonalData")
            .Produces(StatusCodes.Status200OK, contentType: "application/json");
        group.MapDelete("/account", DeleteAccountAsync)
            .RequireRateLimiting(RateLimitPolicyNames.Privacy)
            .WithName("DeleteAccount")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();
        return endpoints;
    }

    private static PrivacyPolicyResponse GetPolicy(IOptions<ProductOptions> productOptions)
    {
        var options = productOptions.Value;
        return new PrivacyPolicyResponse(
            PrivacyPolicy.CurrentVersion,
            "2026-07-03",
            $"{options.PublicWebUrl.TrimEnd('/')}/privacy",
            options.SupportEmail);
    }

    private static async Task<IResult> AcceptConsentAsync(
        AcceptPrivacyConsentRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IPrivacyService privacyService,
        CancellationToken cancellationToken)
    {
        if (!request.Accepted
            || !string.Equals(request.PolicyVersion, PrivacyPolicy.CurrentVersion, StringComparison.Ordinal))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.PolicyVersion),
                "The current privacy policy must be accepted.");
        }

        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        var userContext = await appUserProfileService.ResolveAsync(identity, cancellationToken);
        return Results.Ok(await privacyService.AcceptAsync(
            userContext,
            request.PolicyVersion,
            cancellationToken));
    }

    private static async Task<IResult> ExportAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IPrivacyService privacyService,
        CancellationToken cancellationToken)
    {
        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        var userContext = await appUserProfileService.ResolveAsync(identity, cancellationToken);
        var export = await privacyService.ExportAsync(userContext, cancellationToken);
        var fileName = $"spndrr-export-{export.GeneratedAt:yyyyMMddHHmmss}.json";
        return Results.Stream(
            async stream => await JsonSerializer.SerializeAsync(
                stream,
                export,
                cancellationToken: cancellationToken),
            "application/json",
            fileName);
    }

    private static async Task<IResult> DeleteAccountAsync(
        [FromBody] DeleteAccountRequest request,
        HttpContext httpContext,
        IPrivacyService privacyService,
        IOptions<AuthCookieOptions> cookieOptions,
        CancellationToken cancellationToken)
    {
        var validation = EndpointValidation.Validate(request);
        if (validation is not null)
        {
            return validation;
        }

        if (!string.Equals(request.Confirmation, "DELETE", StringComparison.Ordinal))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.Confirmation),
                "Confirmation must be exactly DELETE.");
        }

        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        if (!await privacyService.DeleteAccountAsync(identity, request.Password, cancellationToken))
        {
            return Results.Unauthorized();
        }

        httpContext.Response.Cookies.Delete(
            AuthCookieOptions.RefreshCookieName,
            cookieOptions.Value.Build(DateTimeOffset.UnixEpoch));
        httpContext.Response.Cookies.Delete(
            AuthCookieOptions.SessionCookieName,
            cookieOptions.Value.Build(DateTimeOffset.UnixEpoch));
        return Results.NoContent();
    }
}
