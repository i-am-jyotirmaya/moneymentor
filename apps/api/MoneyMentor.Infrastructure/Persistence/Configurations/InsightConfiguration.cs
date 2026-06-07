using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class InsightConfiguration : IEntityTypeConfiguration<Insight>
{
    public void Configure(EntityTypeBuilder<Insight> builder)
    {
        builder.ToTable("insights", MoneyMentorDbContext.AppSchema);

        builder.HasKey(insight => insight.Id);

        builder.Property(insight => insight.Id)
            .ValueGeneratedNever();

        builder.Property(insight => insight.Type)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(insight => insight.Title)
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(insight => insight.Summary)
            .HasMaxLength(2000)
            .IsRequired();

        builder.Property(insight => insight.Severity)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(insight => insight.Judgment)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(insight => insight.Recommendation)
            .HasMaxLength(2000);

        builder.Property(insight => insight.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(insight => insight.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(insight => insight.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(insight => insight.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(insight => new
        {
            insight.HouseholdId,
            insight.UserProfileId,
            insight.CreatedAt
        });
    }
}
