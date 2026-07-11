using MoneyMentor.Application.AppUsers;

namespace MoneyMentor.Api.Endpoints.Privacy;

public sealed class PrivacyConsentMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(
        HttpContext context,
        IAppUserProfileService appUserProfileService)
    {
        if (context.User.Identity?.IsAuthenticated != true
            || !context.Request.Path.StartsWithSegments("/api")
            || IsAllowedWithoutConsent(context.Request.Path))
        {
            await next(context);
            return;
        }

        var identity = AppUserIdentityFactory.FromPrincipal(context.User);
        if (identity is null)
        {
            await next(context);
            return;
        }

        var userContext = await appUserProfileService.ResolveAsync(identity, context.RequestAborted);
        if (userContext.HasCurrentPrivacyConsent)
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status428PreconditionRequired;
        await Results.Problem(
            title: "Privacy consent required.",
            detail: "Accept the current MoneyMentor privacy notice before using finance features.",
            statusCode: StatusCodes.Status428PreconditionRequired,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = "privacy_consent_required"
            }).ExecuteAsync(context);
    }

    private static bool IsAllowedWithoutConsent(PathString path) =>
        path.StartsWithSegments("/api/auth")
        || path.StartsWithSegments("/api/public")
        || path.StartsWithSegments("/api/privacy");
}
