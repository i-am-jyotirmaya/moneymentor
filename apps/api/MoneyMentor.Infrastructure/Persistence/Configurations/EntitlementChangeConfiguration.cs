using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class EntitlementChangeConfiguration : IEntityTypeConfiguration<EntitlementChange>
{
    public void Configure(EntityTypeBuilder<EntitlementChange> builder)
    {
        builder.ToTable("entitlement_changes", MoneyMentorDbContext.AppSchema);
        builder.HasKey(change => change.Id);
        builder.Property(change => change.Id).ValueGeneratedNever();
        builder.Property(change => change.PreviousPlan).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(change => change.NewPlan).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(change => change.Operator).HasMaxLength(256).IsRequired();
        builder.Property(change => change.Reason).HasMaxLength(1024).IsRequired();
        builder.Property(change => change.ChangedAt).HasDefaultValueSql("now()");
        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(change => change.UserProfileId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();
        builder.HasIndex(change => new { change.UserProfileId, change.ChangedAt });
    }
}
