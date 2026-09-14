using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Application.Telemetry;

namespace MoneyMentor.Api.Endpoints.Auth;

internal sealed class PostgresAuthManager : IAuthManager
{
    private static readonly string[] InvalidCredentialsErrors = ["Unable to sign in with the provided credentials."];
    private static readonly string[] InvalidRefreshTokenErrors = ["Invalid refresh token."];
    private static readonly string[] LockedOutErrors = ["Unable to sign in with the provided credentials."];
    private static readonly string[] UnauthorizedErrors = ["Authentication is required."];

    private readonly IAuthRepository _authRepository;
    private readonly JwtOptions _jwtOptions;
    private readonly TimeProvider _timeProvider;
    private readonly IAppUserProfileService _appUserProfileService;
    private readonly IPrivacyService _privacyService;

    public PostgresAuthManager(
        IAuthRepository authRepository,
        IOptions<JwtOptions> jwtOptions,
        TimeProvider timeProvider,
        IAppUserProfileService appUserProfileService,
        IPrivacyService privacyService)
    {
        _authRepository = authRepository;
        _jwtOptions = jwtOptions.Value;
        _timeProvider = timeProvider;
        _appUserProfileService = appUserProfileService;
        _privacyService = privacyService;
    }

    public async Task<AuthManagerResult<AuthSessionResponse>> CreateUserAsync(
        CreateUserRequest request,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var result = await _authRepository.CreateUserAsync(
            request.Email,
            request.Password,
            request.DisplayName,
            cancellationToken,
            request.InvitationToken);

        if (!result.Succeeded || result.Value is null)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                GetCreateUserFailureKind(result.Errors),
                result.Errors.Select(error => error.Description));
        }

        var userContext = await ResolveAppUserAsync(result.Value, cancellationToken);
        await _privacyService.AcceptAsync(
            userContext,
            request.PrivacyPolicyVersion,
            cancellationToken);
        return await IssueSessionAsync(
            result.Value,
            ipAddress,
            requiresPrivacyConsent: false,
            cancellationToken);
    }

    public async Task<AuthManagerResult<AuthSessionResponse>> LoginAsync(
        LoginRequest request,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var user = await _authRepository.FindUserByEmailAsync(request.Email, cancellationToken);

        if (user is null)
        {
            RecordAuthFailure("invalid_credentials");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidCredentialsErrors);
        }

        if (await _authRepository.IsLockedOutAsync(user, cancellationToken))
        {
            RecordAuthFailure("locked_out");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.LockedOut,
                LockedOutErrors);
        }

        var passwordIsValid = await _authRepository.CheckPasswordAsync(
            user,
            request.Password,
            cancellationToken);

        if (!passwordIsValid)
        {
            await _authRepository.RecordFailedLoginAsync(user, cancellationToken);
            var failureKind = await _authRepository.IsLockedOutAsync(user, cancellationToken)
                ? AuthFailureKind.LockedOut
                : AuthFailureKind.InvalidCredentials;
            RecordAuthFailure(failureKind == AuthFailureKind.LockedOut ? "locked_out" : "invalid_credentials");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                failureKind,
                failureKind == AuthFailureKind.LockedOut ? LockedOutErrors : InvalidCredentialsErrors);
        }

        var resetResult = await _authRepository.ResetFailedLoginAsync(user, cancellationToken);
        if (!resetResult.Succeeded)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.Validation,
                resetResult.Errors.Select(error => error.Description));
        }

        var now = _timeProvider.GetUtcNow();
        var updateResult = await _authRepository.UpdateLastSignedInAtAsync(
            user,
            now,
            cancellationToken);

        if (!updateResult.Succeeded)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.Validation,
                updateResult.Errors.Select(error => error.Description));
        }

        var userContext = await ResolveAppUserAsync(user, cancellationToken);
        return await IssueSessionAsync(
            user,
            ipAddress,
            !userContext.HasCurrentPrivacyConsent,
            cancellationToken);
    }

    public async Task<AuthManagerResult<AuthSessionResponse>> RefreshAsync(
        string refreshToken,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var tokenHash = HashToken(refreshToken);
        var existingRefreshToken = await _authRepository.FindRefreshTokenByHashAsync(
            tokenHash,
            cancellationToken);

        var now = _timeProvider.GetUtcNow();
        if (existingRefreshToken is null)
        {
            RecordAuthFailure("invalid_refresh");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidRefreshTokenErrors);
        }


        if (existingRefreshToken.RevokedAt is not null)
        {
            if (existingRefreshToken.ReplacedByTokenHash is not null)
            {
                await _authRepository.RevokeSessionAsync(
                    existingRefreshToken.SessionId,
                    now,
                    ipAddress,
                    cancellationToken);
            }

            RecordAuthFailure("refresh_replay");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidRefreshTokenErrors);
        }

        if (existingRefreshToken.ExpiresAt <= now
            || existingRefreshToken.Session.RevokedAt is not null
            || existingRefreshToken.Session.ExpiresAt <= now)
        {
            RecordAuthFailure("expired_session");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidRefreshTokenErrors);
        }

        var replacementToken = CreateRefreshToken(
            existingRefreshToken.UserId,
            existingRefreshToken.SessionId,
            now,
            ipAddress);

        var replaced = await _authRepository.ReplaceRefreshTokenAsync(
            existingRefreshToken,
            replacementToken.Entity,
            now,
            ipAddress,
            cancellationToken);
        if (!replaced)
        {
            await _authRepository.RevokeSessionAsync(
                existingRefreshToken.SessionId,
                now,
                ipAddress,
                cancellationToken);
            RecordAuthFailure("concurrent_refresh_reuse");
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidRefreshTokenErrors);
        }

        var user = existingRefreshToken.User;
        var userContext = await ResolveAppUserAsync(user, cancellationToken);
        var roles = await _authRepository.GetRolesAsync(user, cancellationToken);
        var accessToken = CreateAccessToken(
            user,
            roles,
            existingRefreshToken.SessionId,
            now,
            out var accessTokenExpiresAt);

        return AuthManagerResult<AuthSessionResponse>.Success(
            new AuthSessionResponse(
                accessToken,
                accessTokenExpiresAt,
                MapUser(user, roles),
                !userContext.HasCurrentPrivacyConsent)
            {
                RefreshToken = replacementToken.PlainTextToken,
                RefreshTokenExpiresAt = replacementToken.Entity.ExpiresAt,
                SessionId = existingRefreshToken.SessionId
            });
    }

    public async Task<AuthManagerResult> LogoutAsync(
        string refreshTokenValue,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var tokenHash = HashToken(refreshTokenValue);
        var refreshToken = await _authRepository.FindRefreshTokenByHashAsync(tokenHash, cancellationToken);

        if (refreshToken is not null && refreshToken.RevokedAt is null)
        {
            await _authRepository.RevokeSessionAsync(
                refreshToken.SessionId,
                _timeProvider.GetUtcNow(),
                ipAddress,
                cancellationToken);
        }

        return AuthManagerResult.Success();
    }

    public async Task<AuthManagerResult> RevokeUserRefreshTokensAsync(
        ClaimsPrincipal principal,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(principal, out var userId))
        {
            return AuthManagerResult.Failure(AuthFailureKind.Unauthorized, UnauthorizedErrors);
        }

        await _authRepository.RevokeActiveSessionsForUserAsync(
            userId,
            _timeProvider.GetUtcNow(),
            ipAddress,
            cancellationToken);

        return AuthManagerResult.Success();
    }

    public async Task<AuthManagerResult<AuthUserResponse>> GetCurrentUserAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        if (!TryGetUserId(principal, out var userId))
        {
            return AuthManagerResult<AuthUserResponse>.Failure(
                AuthFailureKind.Unauthorized,
                UnauthorizedErrors);
        }

        var user = await _authRepository.FindUserByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return AuthManagerResult<AuthUserResponse>.Failure(
                AuthFailureKind.NotFound,
                ["User was not found."]);
        }

        var roles = await _authRepository.GetRolesAsync(user, cancellationToken);

        return AuthManagerResult<AuthUserResponse>.Success(MapUser(user, roles));
    }

    private async Task<AuthManagerResult<AuthSessionResponse>> IssueSessionAsync(
        ApplicationUser user,
        string? ipAddress,
        bool requiresPrivacyConsent,
        CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var roles = await _authRepository.GetRolesAsync(user, cancellationToken);
        var session = new AuthSession
        {
            UserId = user.Id,
            CreatedAt = now,
            ExpiresAt = now.AddDays(_jwtOptions.RefreshTokenDays),
            CreatedByIp = ipAddress
        };
        var accessToken = CreateAccessToken(
            user,
            roles,
            session.Id,
            now,
            out var accessTokenExpiresAt);
        var refreshToken = CreateRefreshToken(user.Id, session.Id, now, ipAddress);

        await _authRepository.AddSessionAsync(session, refreshToken.Entity, cancellationToken);

        return AuthManagerResult<AuthSessionResponse>.Success(
            new AuthSessionResponse(
                accessToken,
                accessTokenExpiresAt,
                MapUser(user, roles),
                requiresPrivacyConsent)
            {
                RefreshToken = refreshToken.PlainTextToken,
                RefreshTokenExpiresAt = refreshToken.Entity.ExpiresAt,
                SessionId = session.Id
            });
    }

    private string CreateAccessToken(
        ApplicationUser user,
        IReadOnlyCollection<string> roles,
        Guid sessionId,
        DateTimeOffset now,
        out DateTimeOffset expiresAt)
    {
        expiresAt = now.AddMinutes(_jwtOptions.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("sid", sessionId.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(ClaimTypes.Name, user.DisplayName)
        };

        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.SigningKey));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private RefreshTokenEnvelope CreateRefreshToken(
        Guid userId,
        Guid sessionId,
        DateTimeOffset now,
        string? ipAddress)
    {
        var plainTextToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        var refreshToken = new RefreshToken
        {
            UserId = userId,
            SessionId = sessionId,
            TokenHash = HashToken(plainTextToken),
            CreatedAt = now,
            ExpiresAt = now.AddDays(_jwtOptions.RefreshTokenDays),
            CreatedByIp = ipAddress
        };

        return new RefreshTokenEnvelope(plainTextToken, refreshToken);
    }

    private static AuthUserResponse MapUser(
        ApplicationUser user,
        IReadOnlyCollection<string> roles) =>
        new(
            user.Id,
            user.Email ?? string.Empty,
            user.DisplayName,
            roles);

    private Task<AppUserContext> ResolveAppUserAsync(
        ApplicationUser user,
        CancellationToken cancellationToken) =>
        _appUserProfileService.ResolveAsync(
            new AppUserIdentity(
                "local",
                user.Id.ToString(),
                user.Email,
                user.DisplayName),
            cancellationToken);

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static void RecordAuthFailure(string reason) =>
        MoneyMentorTelemetry.AuthFailures.Add(
            1,
            new KeyValuePair<string, object?>("reason", reason));

    private static bool TryGetUserId(ClaimsPrincipal principal, out Guid userId)
    {
        var userIdValue = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(userIdValue, out userId);
    }

    private static AuthFailureKind GetCreateUserFailureKind(
        IReadOnlyCollection<AuthRepositoryError> errors)
    {
        if (errors.Any(error => error.Code == "MvpApprovalRequired"))
            return AuthFailureKind.Forbidden;

        return errors.Any(error =>
            error.Code.Equals("DuplicateUserName", StringComparison.OrdinalIgnoreCase) ||
            error.Code.Equals("DuplicateEmail", StringComparison.OrdinalIgnoreCase))
            ? AuthFailureKind.Conflict
            : AuthFailureKind.Validation;
    }

    private sealed record RefreshTokenEnvelope(string PlainTextToken, RefreshToken Entity);
}
