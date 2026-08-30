using MoneyMentor.Infrastructure.Identity;

namespace MoneyMentor.Infrastructure.Auth;

public interface IAuthRepository
{
    Task<AuthRepositoryResult<ApplicationUser>> CreateUserAsync(
        string email,
        string password,
        string displayName,
        CancellationToken cancellationToken);

    Task<ApplicationUser?> FindUserByEmailAsync(string email, CancellationToken cancellationToken);

    Task<ApplicationUser?> FindUserByIdAsync(Guid userId, CancellationToken cancellationToken);

    Task<bool> CheckPasswordAsync(ApplicationUser user, string password, CancellationToken cancellationToken);

    Task<bool> IsLockedOutAsync(ApplicationUser user, CancellationToken cancellationToken);

    Task<AuthRepositoryResult> RecordFailedLoginAsync(ApplicationUser user, CancellationToken cancellationToken);

    Task<AuthRepositoryResult> ResetFailedLoginAsync(ApplicationUser user, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<string>> GetRolesAsync(ApplicationUser user, CancellationToken cancellationToken);

    Task<AuthRepositoryResult> UpdateLastSignedInAtAsync(
        ApplicationUser user,
        DateTimeOffset signedInAt,
        CancellationToken cancellationToken);

    Task AddSessionAsync(
        AuthSession session,
        RefreshToken refreshToken,
        CancellationToken cancellationToken);

    Task<RefreshToken?> FindRefreshTokenByHashAsync(
        string tokenHash,
        CancellationToken cancellationToken);

    Task<bool> ReplaceRefreshTokenAsync(
        RefreshToken existingRefreshToken,
        RefreshToken replacementRefreshToken,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken);

    Task RevokeSessionAsync(
        Guid sessionId,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken);

    Task RevokeActiveSessionsForUserAsync(
        Guid userId,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken);

    Task<bool> IsSessionActiveAsync(
        Guid sessionId,
        Guid userId,
        DateTimeOffset now,
        CancellationToken cancellationToken);
}
