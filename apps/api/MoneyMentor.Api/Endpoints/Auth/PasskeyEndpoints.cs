using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using MoneyMentor.Api.Production;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Identity;

namespace MoneyMentor.Api.Endpoints.Auth;

internal static class PasskeyEndpoints
{
    private const int MaximumPasskeys = 10;
    private const int MaximumBodyBytes = 32 * 1024;

    public static void MapPasskeyEndpoints(this RouteGroupBuilder auth)
    {
        var group = auth.MapGroup("/passkeys").AddEndpointFilter(async (invocation, next) =>
        {
            invocation.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(invocation);
        });
        var account = group.MapGroup("").RequireAuthorization();
        account.MapGet("", ListAsync).Produces<PasskeySummary[]>();
        account.MapPost("/registration/options", BeginRegistrationAsync)
            .RequireRateLimiting(RateLimitPolicyNames.Login).Produces<PasskeyOptionsResponse>();
        account.MapPost("/registration/verify", FinishRegistrationAsync)
            .RequireRateLimiting(RateLimitPolicyNames.Session).Produces(StatusCodes.Status204NoContent);
        account.MapPost("/{credentialId}/remove", RemoveAsync)
            .RequireRateLimiting(RateLimitPolicyNames.Login).Produces(StatusCodes.Status204NoContent);
        group.MapPost("/login/options", BeginLoginAsync).AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Session).Produces<PasskeyOptionsResponse>();
        group.MapPost("/login/verify", FinishLoginAsync).AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicyNames.Login).Produces<AuthSessionResponse>();
    }

    private static async Task<IResult> ListAsync(HttpContext context, UserManager<ApplicationUser> users)
    {
        var user = await users.FindByIdAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (user is null) return Results.Unauthorized();
        var passkeys = await users.GetPasskeysAsync(user);
        return Results.Ok(passkeys.OrderByDescending(passkey => passkey.CreatedAt)
            .Select(passkey => new PasskeySummary(WebEncoders.Base64UrlEncode(passkey.CredentialId), passkey.CreatedAt)));
    }

    [RequestSizeLimit(MaximumBodyBytes)]
    private static async Task<IResult> BeginRegistrationAsync(
        PasswordConfirmation request, HttpContext context,
        UserManager<ApplicationUser> users, IAuthRepository auth, IPasskeyHandler<ApplicationUser> handler,
        PasskeyChallengeStore challenges, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (user is null || !TryGetSessionId(context, out var sessionId)) return Results.Unauthorized();
        if (!await ConfirmPasswordAsync(user, request, auth, cancellationToken)) return PasswordRejected();
        if ((await users.GetPasskeysAsync(user)).Count >= MaximumPasskeys) return PasskeyLimit();

        var options = await handler.MakeCreationOptionsAsync(new PasskeyUserEntity
        {
            Id = await users.GetUserIdAsync(user),
            Name = user.Email ?? user.UserName ?? user.Id.ToString(),
            DisplayName = user.DisplayName
        }, context);
        return await CreateOptionsAsync(options.CreationOptionsJson, options.AttestationState, sessionId, challenges, cancellationToken);
    }

    [RequestSizeLimit(MaximumBodyBytes)]
    private static async Task<IResult> FinishRegistrationAsync(
        PasskeyVerification request, HttpContext context,
        UserManager<ApplicationUser> users, IPasskeyHandler<ApplicationUser> handler,
        PasskeyChallengeStore challenges, PostgresPasskeyStore credentials, CancellationToken cancellationToken)
    {
        if (!TryGetSessionId(context, out var sessionId)) return Results.Unauthorized();
        var state = await challenges.ConsumeAsync(request.ChallengeId, sessionId, cancellationToken);
        if (state is null || request.Credential.ValueKind != JsonValueKind.Object) return RegistrationRejected();

        var result = await handler.PerformAttestationAsync(new PasskeyAttestationContext
        {
            HttpContext = context,
            CredentialJson = request.Credential.GetRawText(),
            AttestationState = state
        });
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!result.Succeeded || result.Passkey is null || result.UserEntity?.Id != userId) return RegistrationRejected();
        var user = await users.FindByIdAsync(userId!);
        if (user is null) return Results.Unauthorized();
        if ((await users.GetPasskeysAsync(user)).Count >= MaximumPasskeys) return PasskeyLimit();

        var saved = await credentials.RegisterAsync(user.Id, result.Passkey, cancellationToken);
        return saved ? Results.NoContent() : RegistrationRejected();
    }

    [RequestSizeLimit(MaximumBodyBytes)]
    private static async Task<IResult> RemoveAsync(
        string credentialId, PasswordConfirmation request,
        HttpContext context, UserManager<ApplicationUser> users, IAuthRepository auth,
        PostgresPasskeyStore credentials, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (user is null) return Results.Unauthorized();
        if (!await ConfirmPasswordAsync(user, request, auth, cancellationToken)) return PasswordRejected();
        if (credentialId.Length > 1366) return Results.NotFound();
        byte[] id;
        try { id = WebEncoders.Base64UrlDecode(credentialId); }
        catch (FormatException) { return Results.NotFound(); }
        var removed = await credentials.RemoveAsync(user.Id, id, cancellationToken);
        return removed == 1 ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> BeginLoginAsync(
        HttpContext context, IPasskeyHandler<ApplicationUser> handler, PasskeyChallengeStore challenges,
        CancellationToken cancellationToken)
    {
        var options = await handler.MakeRequestOptionsAsync(null, context);
        return await CreateOptionsAsync(options.RequestOptionsJson, options.AssertionState, null, challenges, cancellationToken);
    }

    [RequestSizeLimit(MaximumBodyBytes)]
    private static async Task<IResult> FinishLoginAsync(
        PasskeyVerification request, HttpContext context,
        IPasskeyHandler<ApplicationUser> handler, PasskeyChallengeStore challenges, PostgresPasskeyStore credentials,
        IAuthManager auth, IOptions<AuthCookieOptions> cookies, CancellationToken cancellationToken)
    {
        var state = await challenges.ConsumeAsync(request.ChallengeId, null, cancellationToken);
        if (state is null || request.Credential.ValueKind != JsonValueKind.Object) return LoginRejected();
        var result = await handler.PerformAssertionAsync(new PasskeyAssertionContext
        {
            HttpContext = context,
            CredentialJson = request.Credential.GetRawText(),
            AssertionState = state
        });
        if (!result.Succeeded || result.User is null || result.Passkey is null) return LoginRejected();
        if (!await credentials.UpdateAssertionAsync(result.User.Id, result.Passkey, cancellationToken)) return LoginRejected();

        var session = await auth.LoginWithPasskeyAsync(result.User, context.Connection.RemoteIpAddress?.ToString(), cancellationToken);
        return AuthEndpoints.ToSessionResult(session, context, cookies.Value);
    }

    private static async Task<IResult> CreateOptionsAsync(string json, string? state, Guid? sessionId,
        PasskeyChallengeStore challenges, CancellationToken cancellationToken)
    {
        if (state is null) throw new InvalidOperationException("Identity did not return a passkey challenge.");
        var id = await challenges.CreateAsync(state, sessionId, cancellationToken);
        return Results.Ok(new PasskeyOptionsResponse(id, JsonSerializer.Deserialize<JsonElement>(json)));
    }

    private static async Task<bool> ConfirmPasswordAsync(ApplicationUser user, PasswordConfirmation request,
        IAuthRepository auth, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.Password) || await auth.IsLockedOutAsync(user, cancellationToken)) return false;
        if (await auth.CheckPasswordAsync(user, request.Password, cancellationToken))
        {
            return (await auth.ResetFailedLoginAsync(user, cancellationToken)).Succeeded;
        }
        await auth.RecordFailedLoginAsync(user, cancellationToken);
        return false;
    }

    private static bool TryGetSessionId(HttpContext context, out Guid id) =>
        Guid.TryParse(context.User.FindFirstValue("sid"), out id);

    private static IResult PasswordRejected() => Results.BadRequest(new AuthErrorResponse(["Unable to confirm your password."]));
    private static IResult PasskeyLimit() => Results.Conflict(new AuthErrorResponse(["Remove a passkey before adding another."]));
    private static IResult RegistrationRejected() => Results.BadRequest(new AuthErrorResponse(["Unable to verify this passkey. Try adding it again."]));
    private static IResult LoginRejected() => Results.Json(new AuthErrorResponse(["Unable to sign in with this passkey."]), statusCode: StatusCodes.Status401Unauthorized);

    public sealed record PasswordConfirmation(string? Password);
    public sealed record PasskeyVerification(Guid ChallengeId, JsonElement Credential);
    public sealed record PasskeyOptionsResponse(Guid ChallengeId, JsonElement PublicKey);
    public sealed record PasskeySummary(string Id, DateTimeOffset CreatedAt);
}
