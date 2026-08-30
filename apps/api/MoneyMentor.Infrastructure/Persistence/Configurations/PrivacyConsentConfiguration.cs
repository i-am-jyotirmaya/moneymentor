using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class PrivacyConsentConfiguration : IEntityTypeConfiguration<PrivacyConsent>
{
    public void Configure(EntityTypeBuilder<PrivacyConsent> builder)
    {
        builder.ToTable("privacy_consents", MoneyMentorDbContext.AppSchema);
        builder.HasKey(consent => consent.Id);
        builder.Property(consent => consent.Id).ValueGeneratedNever();
        builder.Property(consent => consent.PolicyVersion).HasMaxLength(64).IsRequired();
        builder.Property(consent => consent.AcceptedAt).HasDefaultValueSql("now()");
        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(consent => consent.UserProfileId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();
        builder.HasIndex(consent => new { consent.UserProfileId, consent.PolicyVersion }).IsUnique();
    }
}
