using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Auth;

internal sealed class PostgresAuthRepository : IAuthRepository
{
    private readonly MoneyMentorAuthDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;

    public PostgresAuthRepository(
        MoneyMentorAuthDbContext dbContext,
        UserManager<ApplicationUser> userManager)
    {
        _dbContext = dbContext;
        _userManager = userManager;
    }

    public async Task<AuthRepositoryResult<ApplicationUser>> CreateUserAsync(
        string email,
        string password,
        string displayName,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var normalizedEmail = email.Trim();
        var user = new ApplicationUser
        {
            Email = normalizedEmail,
            UserName = normalizedEmail,
            DisplayName = displayName.Trim()
        };

        var result = await _userManager.CreateAsync(user, password);

        return result.Succeeded
            ? AuthRepositoryResult<ApplicationUser>.Success(user)
            : AuthRepositoryResult<ApplicationUser>.Failure(MapErrors(result));
    }

    public async Task<ApplicationUser?> FindUserByEmailAsync(
        string email,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return await _userManager.FindByEmailAsync(email.Trim());
    }

    public async Task<ApplicationUser?> FindUserByIdAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        return await _dbContext.Users
            .FirstOrDefaultAsync(user => user.Id == userId, cancellationToken);
    }

    public async Task<bool> CheckPasswordAsync(
        ApplicationUser user,
        string password,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return await _userManager.CheckPasswordAsync(user, password);
    }

    public async Task<bool> IsLockedOutAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await _userManager.IsLockedOutAsync(user);
    }

    public async Task<AuthRepositoryResult> RecordFailedLoginAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = await _userManager.AccessFailedAsync(user);
        return result.Succeeded
            ? AuthRepositoryResult.Success()
            : AuthRepositoryResult.Failure(MapErrors(result));
    }

    public async Task<AuthRepositoryResult> ResetFailedLoginAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var result = await _userManager.ResetAccessFailedCountAsync(user);
        return result.Succeeded
            ? AuthRepositoryResult.Success()
            : AuthRepositoryResult.Failure(MapErrors(result));
    }

    public async Task<IReadOnlyCollection<string>> GetRolesAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return (await _userManager.GetRolesAsync(user)).ToArray();
    }

    public async Task<AuthRepositoryResult> UpdateLastSignedInAtAsync(
        ApplicationUser user,
        DateTimeOffset signedInAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        user.LastSignedInAt = signedInAt;
        var result = await _userManager.UpdateAsync(user);

        return result.Succeeded
            ? AuthRepositoryResult.Success()
            : AuthRepositoryResult.Failure(MapErrors(result));
    }

    public async Task AddSessionAsync(
        AuthSession session,
        RefreshToken refreshToken,
        CancellationToken cancellationToken)
    {
        await _dbContext.AuthSessions.AddAsync(session, cancellationToken);
        await _dbContext.RefreshTokens.AddAsync(refreshToken, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<RefreshToken?> FindRefreshTokenByHashAsync(
        string tokenHash,
        CancellationToken cancellationToken)
    {
        return await _dbContext.RefreshTokens
            .Include(refreshToken => refreshToken.User)
            .Include(refreshToken => refreshToken.Session)
            .FirstOrDefaultAsync(refreshToken => refreshToken.TokenHash == tokenHash, cancellationToken);
    }

    public async Task<bool> ReplaceRefreshTokenAsync(
        RefreshToken existingRefreshToken,
        RefreshToken replacementRefreshToken,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var updated = await _dbContext.RefreshTokens
            .Where(token => token.Id == existingRefreshToken.Id && token.RevokedAt == null)
            .ExecuteUpdateAsync(
                updates => updates
                    .SetProperty(token => token.RevokedAt, revokedAt)
                    .SetProperty(token => token.RevokedByIp, revokedByIp)
                    .SetProperty(token => token.ReplacedByTokenHash, replacementRefreshToken.TokenHash),
                cancellationToken);
        if (updated == 0)
        {
            await transaction.RollbackAsync(cancellationToken);
            return false;
        }

        _dbContext.Entry(existingRefreshToken).State = EntityState.Detached;
        await _dbContext.RefreshTokens.AddAsync(replacementRefreshToken, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task RevokeSessionAsync(
        Guid sessionId,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken)
    {
        await _dbContext.AuthSessions
            .Where(session => session.Id == sessionId && session.RevokedAt == null)
            .ExecuteUpdateAsync(
                updates => updates
                    .SetProperty(session => session.RevokedAt, revokedAt)
                    .SetProperty(session => session.RevokedByIp, revokedByIp),
                cancellationToken);
        await _dbContext.RefreshTokens
            .Where(token => token.SessionId == sessionId && token.RevokedAt == null)
            .ExecuteUpdateAsync(
                updates => updates
                    .SetProperty(token => token.RevokedAt, revokedAt)
                    .SetProperty(token => token.RevokedByIp, revokedByIp),
                cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RevokeActiveSessionsForUserAsync(
        Guid userId,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken)
    {
        await _dbContext.AuthSessions
            .Where(session => session.UserId == userId
                && session.RevokedAt == null
                && session.ExpiresAt > revokedAt)
            .ExecuteUpdateAsync(
                updates => updates
                    .SetProperty(session => session.RevokedAt, revokedAt)
                    .SetProperty(session => session.RevokedByIp, revokedByIp),
                cancellationToken);
        await _dbContext.RefreshTokens
            .Where(token => token.UserId == userId && token.RevokedAt == null)
            .ExecuteUpdateAsync(
                updates => updates
                    .SetProperty(token => token.RevokedAt, revokedAt)
                    .SetProperty(token => token.RevokedByIp, revokedByIp),
                cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public Task<bool> IsSessionActiveAsync(
        Guid sessionId,
        Guid userId,
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        _dbContext.AuthSessions.AsNoTracking().AnyAsync(
            session => session.Id == sessionId
                && session.UserId == userId
                && session.RevokedAt == null
                && session.ExpiresAt > now,
            cancellationToken);

    private static IEnumerable<AuthRepositoryError> MapErrors(IdentityResult result) =>
        result.Errors.Select(error => new AuthRepositoryError(error.Code, error.Description));
}
