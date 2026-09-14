using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Infrastructure.Identity;

namespace MoneyMentor.Infrastructure.Persistence;

public sealed class MoneyMentorAuthDbContext
    : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>
{
    public const string AuthSchema = "auth";

    public MoneyMentorAuthDbContext(DbContextOptions<MoneyMentorAuthDbContext> options)
        : base(options)
    {
    }

    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();

    public DbSet<MvpAccessRequest> MvpAccessRequests => Set<MvpAccessRequest>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        ConfigureIdentityTables(builder);
        ConfigureApplicationUser(builder);
        ConfigureApplicationRole(builder);
        ConfigureRefreshToken(builder);
        ConfigureAuthSession(builder);
        builder.ApplyConfiguration(new Auth.MvpAccessRequestConfiguration());
    }

    private static void ConfigureIdentityTables(ModelBuilder builder)
    {
        builder.HasDefaultSchema(AuthSchema);

        builder.Entity<ApplicationUser>().ToTable("users", AuthSchema);
        builder.Entity<ApplicationRole>().ToTable("roles", AuthSchema);
        builder.Entity<IdentityUserRole<Guid>>().ToTable("user_roles", AuthSchema);
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claims", AuthSchema);
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("user_logins", AuthSchema);
        builder.Entity<IdentityRoleClaim<Guid>>().ToTable("role_claims", AuthSchema);
        builder.Entity<IdentityUserToken<Guid>>().ToTable("user_tokens", AuthSchema);
    }

    private static void ConfigureApplicationUser(ModelBuilder builder)
    {
        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(user => user.DisplayName)
                .HasMaxLength(128)
                .IsRequired();

            entity.Property(user => user.CreatedAt)
                .HasDefaultValueSql("now()");

            entity.HasMany(user => user.RefreshTokens)
                .WithOne(refreshToken => refreshToken.User)
                .HasForeignKey(refreshToken => refreshToken.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(user => user.AuthSessions)
                .WithOne(session => session.User)
                .HasForeignKey(session => session.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureApplicationRole(ModelBuilder builder)
    {
        builder.Entity<ApplicationRole>(entity =>
        {
            entity.Property(role => role.CreatedAt)
                .HasDefaultValueSql("now()");
        });
    }

    private static void ConfigureRefreshToken(ModelBuilder builder)
    {
        builder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("refresh_tokens", AuthSchema);

            entity.HasKey(refreshToken => refreshToken.Id);

            entity.Property(refreshToken => refreshToken.TokenHash)
                .HasMaxLength(512)
                .IsRequired();

            entity.Property(refreshToken => refreshToken.ReplacedByTokenHash)
                .HasMaxLength(512);

            entity.Property(refreshToken => refreshToken.CreatedByIp)
                .HasMaxLength(45);

            entity.Property(refreshToken => refreshToken.RevokedByIp)
                .HasMaxLength(45);

            entity.Property(refreshToken => refreshToken.CreatedAt)
                .HasDefaultValueSql("now()");

            entity.Ignore(refreshToken => refreshToken.IsExpired);
            entity.Ignore(refreshToken => refreshToken.IsActive);

            entity.HasIndex(refreshToken => refreshToken.TokenHash)
                .IsUnique();

            entity.HasIndex(refreshToken => new { refreshToken.UserId, refreshToken.ExpiresAt });

            entity.HasOne(refreshToken => refreshToken.Session)
                .WithMany(session => session.RefreshTokens)
                .HasForeignKey(refreshToken => refreshToken.SessionId)
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired();
        });
    }

    private static void ConfigureAuthSession(ModelBuilder builder)
    {
        builder.Entity<AuthSession>(entity =>
        {
            entity.ToTable("auth_sessions", AuthSchema);
            entity.HasKey(session => session.Id);
            entity.Property(session => session.Id).ValueGeneratedNever();
            entity.Property(session => session.CreatedAt).HasDefaultValueSql("now()");
            entity.Property(session => session.CreatedByIp).HasMaxLength(45);
            entity.Property(session => session.RevokedByIp).HasMaxLength(45);
            entity.HasIndex(session => new { session.UserId, session.ExpiresAt });
            entity.HasIndex(session => session.RevokedAt);
        });
    }
}
