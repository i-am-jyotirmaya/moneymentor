using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Auth;

public sealed class MvpAccessRequestConfiguration : IEntityTypeConfiguration<MvpAccessRequest>
{
    public void Configure(EntityTypeBuilder<MvpAccessRequest> builder)
    {
        builder.ToTable("mvp_access_requests", MoneyMentorAuthDbContext.AuthSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Name).HasMaxLength(128).IsRequired();
        builder.Property(item => item.Email).HasMaxLength(256).IsRequired();
        builder.Property(item => item.NormalizedEmail).HasMaxLength(256).IsRequired();
        builder.Property(item => item.Reason).HasMaxLength(1000);
        builder.Property(item => item.Status).HasMaxLength(16).IsRequired();
        builder.Property(item => item.ReviewedBy).HasMaxLength(128);
        builder.Property(item => item.TokenHash).HasMaxLength(64);
        builder.Property(item => item.DeliveryStatus).HasMaxLength(16);
        builder.Property(item => item.ProviderMessageId).HasMaxLength(256);
        builder.Property(item => item.LastDeliveryError).HasMaxLength(1000);
        builder.HasIndex(item => item.NormalizedEmail).IsUnique();
        builder.HasIndex(item => item.TokenHash).IsUnique();
        builder.HasIndex(item => new { item.Status, item.RequestedAt });
    }
}
