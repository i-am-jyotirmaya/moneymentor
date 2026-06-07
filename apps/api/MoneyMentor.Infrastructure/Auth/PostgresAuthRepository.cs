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

    public async Task AddRefreshTokenAsync(
        RefreshToken refreshToken,
        CancellationToken cancellationToken)
    {
        await _dbContext.RefreshTokens.AddAsync(refreshToken, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<RefreshToken?> FindRefreshTokenByHashAsync(
        string tokenHash,
        CancellationToken cancellationToken)
    {
        return await _dbContext.RefreshTokens
            .Include(refreshToken => refreshToken.User)
            .FirstOrDefaultAsync(refreshToken => refreshToken.TokenHash == tokenHash, cancellationToken);
    }

    public async Task ReplaceRefreshTokenAsync(
        RefreshToken existingRefreshToken,
        RefreshToken replacementRefreshToken,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken)
    {
        existingRefreshToken.RevokedAt = revokedAt;
        existingRefreshToken.RevokedByIp = revokedByIp;
        existingRefreshToken.ReplacedByTokenHash = replacementRefreshToken.TokenHash;

        await _dbContext.RefreshTokens.AddAsync(replacementRefreshToken, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RevokeRefreshTokenAsync(
        RefreshToken refreshToken,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken)
    {
        refreshToken.RevokedAt = revokedAt;
        refreshToken.RevokedByIp = revokedByIp;

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RevokeActiveRefreshTokensForUserAsync(
        Guid userId,
        DateTimeOffset revokedAt,
        string? revokedByIp,
        CancellationToken cancellationToken)
    {
        var activeRefreshTokens = await _dbContext.RefreshTokens
            .Where(refreshToken =>
                refreshToken.UserId == userId &&
                refreshToken.RevokedAt == null &&
                refreshToken.ExpiresAt > revokedAt)
            .ToListAsync(cancellationToken);

        foreach (var refreshToken in activeRefreshTokens)
        {
            refreshToken.RevokedAt = revokedAt;
            refreshToken.RevokedByIp = revokedByIp;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private static IEnumerable<AuthRepositoryError> MapErrors(IdentityResult result) =>
        result.Errors.Select(error => new AuthRepositoryError(error.Code, error.Description));
}
