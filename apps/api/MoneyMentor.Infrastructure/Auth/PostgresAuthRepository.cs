using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Registration;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Auth;

internal sealed class PostgresAuthRepository : IAuthRepository
{
    private readonly MoneyMentorAuthDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RegistrationOptions _registration;
    private readonly TimeProvider _clock;

    public PostgresAuthRepository(
        MoneyMentorAuthDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IOptions<RegistrationOptions> registration,
        TimeProvider clock)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _registration = registration.Value;
        _clock = clock;
    }

    public async Task<AuthRepositoryResult<ApplicationUser>> CreateUserAsync(
        string email,
        string password,
        string displayName,
        CancellationToken cancellationToken,
        string? invitationToken = null)
    {
        cancellationToken.ThrowIfCancellationRequested();

        // Keep invitation redemption and Identity creation in one auth transaction.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        MvpAccessRequest? invitation = null;
        if (!_registration.IsOpen || invitationToken is not null)
        {
            if (!string.IsNullOrWhiteSpace(invitationToken) && invitationToken.Length <= 128)
            {
                var hash = MvpInvitationToken.Hash(invitationToken);
                invitation = await _dbContext.MvpAccessRequests
                    .FromSqlInterpolated($"SELECT * FROM auth.mvp_access_requests WHERE \"TokenHash\" = {hash} FOR UPDATE")
                    .SingleOrDefaultAsync(cancellationToken);
            }
            if (invitation is null || invitation.Status != "Approved" || invitation.ExpiresAt <= _clock.GetUtcNow()
                || invitation.ExpiresAt is null
                || invitation.NormalizedEmail != _userManager.NormalizeEmail(email.Trim()))
            {
                return AuthRepositoryResult<ApplicationUser>.Failure([
                    new AuthRepositoryError("MvpApprovalRequired", "A valid MVP approval link is required. Request MVP access or contact support for a replacement link.")]);
            }
        }

        var normalizedEmail = email.Trim();
        var user = new ApplicationUser
        {
            Email = normalizedEmail,
            UserName = normalizedEmail,
            DisplayName = displayName.Trim(),
            EmailConfirmed = invitation is not null
        };

        var result = await _userManager.CreateAsync(user, password);

        if (result.Succeeded)
        {
            if (invitation is not null)
            {
                invitation.Status = "Registered";
                invitation.RegisteredAt = _clock.GetUtcNow();
                invitation.TokenHash = null;
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
        }

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
        if (user.AccessFailedCount == 0)
        {
            return AuthRepositoryResult.Success();
        }

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
        var updated = await _dbContext.Users
            .Where(candidate => candidate.Id == user.Id)
            .ExecuteUpdateAsync(
                updates => updates.SetProperty(candidate => candidate.LastSignedInAt, signedInAt),
                cancellationToken);
        return updated == 1
            ? AuthRepositoryResult.Success()
            : AuthRepositoryResult.Failure(
                [new AuthRepositoryError("UserNotFound", "The user no longer exists.")]);
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
