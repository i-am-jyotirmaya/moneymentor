using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Identity;

namespace MoneyMentor.Api.Auth;

internal sealed class PostgresAuthManager : IAuthManager
{
    private static readonly string[] InvalidCredentialsErrors = ["Invalid email or password."];
    private static readonly string[] InvalidRefreshTokenErrors = ["Invalid refresh token."];
    private static readonly string[] UnauthorizedErrors = ["Authentication is required."];

    private readonly IAuthRepository _authRepository;
    private readonly JwtOptions _jwtOptions;
    private readonly TimeProvider _timeProvider;

    public PostgresAuthManager(
        IAuthRepository authRepository,
        IOptions<JwtOptions> jwtOptions,
        TimeProvider timeProvider)
    {
        _authRepository = authRepository;
        _jwtOptions = jwtOptions.Value;
        _timeProvider = timeProvider;
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
            cancellationToken);

        if (!result.Succeeded || result.Value is null)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                GetCreateUserFailureKind(result.Errors),
                result.Errors.Select(error => error.Description));
        }

        return await IssueSessionAsync(result.Value, ipAddress, cancellationToken);
    }

    public async Task<AuthManagerResult<AuthSessionResponse>> LoginAsync(
        LoginRequest request,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var user = await _authRepository.FindUserByEmailAsync(request.Email, cancellationToken);

        if (user is null)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidCredentialsErrors);
        }

        var passwordIsValid = await _authRepository.CheckPasswordAsync(
            user,
            request.Password,
            cancellationToken);

        if (!passwordIsValid)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidCredentialsErrors);
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

        return await IssueSessionAsync(user, ipAddress, cancellationToken);
    }

    public async Task<AuthManagerResult<AuthSessionResponse>> RefreshAsync(
        RefreshTokenRequest request,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var tokenHash = HashToken(request.RefreshToken);
        var existingRefreshToken = await _authRepository.FindRefreshTokenByHashAsync(
            tokenHash,
            cancellationToken);

        var now = _timeProvider.GetUtcNow();
        if (existingRefreshToken is null || existingRefreshToken.RevokedAt is not null || existingRefreshToken.ExpiresAt <= now)
        {
            return AuthManagerResult<AuthSessionResponse>.Failure(
                AuthFailureKind.InvalidCredentials,
                InvalidRefreshTokenErrors);
        }

        var replacementToken = CreateRefreshToken(existingRefreshToken.UserId, now, ipAddress);

        await _authRepository.ReplaceRefreshTokenAsync(
            existingRefreshToken,
            replacementToken.Entity,
            now,
            ipAddress,
            cancellationToken);

        var user = existingRefreshToken.User;
        var roles = await _authRepository.GetRolesAsync(user, cancellationToken);
        var accessToken = CreateAccessToken(user, roles, now, out var accessTokenExpiresAt);

        return AuthManagerResult<AuthSessionResponse>.Success(
            new AuthSessionResponse(
                accessToken,
                accessTokenExpiresAt,
                replacementToken.PlainTextToken,
                replacementToken.Entity.ExpiresAt,
                MapUser(user, roles)));
    }

    public async Task<AuthManagerResult> LogoutAsync(
        RefreshTokenRequest request,
        string? ipAddress,
        CancellationToken cancellationToken)
    {
        var tokenHash = HashToken(request.RefreshToken);
        var refreshToken = await _authRepository.FindRefreshTokenByHashAsync(tokenHash, cancellationToken);

        if (refreshToken is not null && refreshToken.RevokedAt is null)
        {
            await _authRepository.RevokeRefreshTokenAsync(
                refreshToken,
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

        await _authRepository.RevokeActiveRefreshTokensForUserAsync(
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
        CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();
        var roles = await _authRepository.GetRolesAsync(user, cancellationToken);
        var accessToken = CreateAccessToken(user, roles, now, out var accessTokenExpiresAt);
        var refreshToken = CreateRefreshToken(user.Id, now, ipAddress);

        await _authRepository.AddRefreshTokenAsync(refreshToken.Entity, cancellationToken);

        return AuthManagerResult<AuthSessionResponse>.Success(
            new AuthSessionResponse(
                accessToken,
                accessTokenExpiresAt,
                refreshToken.PlainTextToken,
                refreshToken.Entity.ExpiresAt,
                MapUser(user, roles)));
    }

    private string CreateAccessToken(
        ApplicationUser user,
        IReadOnlyCollection<string> roles,
        DateTimeOffset now,
        out DateTimeOffset expiresAt)
    {
        expiresAt = now.AddMinutes(_jwtOptions.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
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
        DateTimeOffset now,
        string? ipAddress)
    {
        var plainTextToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        var refreshToken = new RefreshToken
        {
            UserId = userId,
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

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static bool TryGetUserId(ClaimsPrincipal principal, out Guid userId)
    {
        var userIdValue = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return Guid.TryParse(userIdValue, out userId);
    }

    private static AuthFailureKind GetCreateUserFailureKind(
        IReadOnlyCollection<AuthRepositoryError> errors)
    {
        return errors.Any(error =>
            error.Code.Equals("DuplicateUserName", StringComparison.OrdinalIgnoreCase) ||
            error.Code.Equals("DuplicateEmail", StringComparison.OrdinalIgnoreCase))
            ? AuthFailureKind.Conflict
            : AuthFailureKind.Validation;
    }

    private sealed record RefreshTokenEnvelope(string PlainTextToken, RefreshToken Entity);
}
