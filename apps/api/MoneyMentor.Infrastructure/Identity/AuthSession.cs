namespace MoneyMentor.Infrastructure.Identity;

public sealed class AuthSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public string? CreatedByIp { get; set; }

    public string? RevokedByIp { get; set; }

    public ApplicationUser User { get; set; } = null!;

    public ICollection<RefreshToken> RefreshTokens { get; } = new List<RefreshToken>();
}
