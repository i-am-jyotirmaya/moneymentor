using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class UserProfileConfiguration : IEntityTypeConfiguration<UserProfile>
{
    public void Configure(EntityTypeBuilder<UserProfile> builder)
    {
        builder.ToTable("user_profiles", MoneyMentorDbContext.AppSchema);

        builder.HasKey(userProfile => userProfile.Id);

        builder.Property(userProfile => userProfile.Id)
            .ValueGeneratedNever();

        builder.Property(userProfile => userProfile.AuthProvider)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(userProfile => userProfile.AuthSubject)
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(userProfile => userProfile.Email)
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(userProfile => userProfile.DisplayName)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(userProfile => userProfile.CurrencyCode)
            .HasMaxLength(3)
            .IsRequired();

        builder.Property(userProfile => userProfile.TimeZone)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(userProfile => userProfile.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(userProfile => userProfile.UpdatedAt)
            .HasDefaultValueSql("now()");

        builder.HasIndex(userProfile => new { userProfile.AuthProvider, userProfile.AuthSubject })
            .IsUnique();

        builder.HasIndex(userProfile => userProfile.Email);
    }
}
