using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgementWorkItemConfiguration : IEntityTypeConfiguration<JudgementWorkItem>
{
    public void Configure(EntityTypeBuilder<JudgementWorkItem> builder)
    {
        builder.ToTable("judgement_work_items", MoneyMentorDbContext.AppSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.Scope).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.Cadence).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.Stage).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.PeriodStart).HasColumnType("date").IsRequired();
        builder.Property(item => item.PeriodEndExclusive).HasColumnType("date").IsRequired();
        builder.Property(item => item.TimeZone).HasMaxLength(100).IsRequired();
        builder.Property(item => item.CurrencyCode).HasMaxLength(3).IsFixedLength().IsRequired();
        builder.Property(item => item.FailureCategory).HasMaxLength(64);
        builder.Property(item => item.ClaimedBy).HasMaxLength(200);
        builder.Property(item => item.LastError).HasMaxLength(1000);
        builder.Property(item => item.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(item => item.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasOne<Household>().WithMany().HasForeignKey(item => item.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(item => item.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<SpendingSummary>().WithMany().HasForeignKey(item => item.SpendingSummaryId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(item => new
            { item.HouseholdId, item.UserProfileId, item.Scope, item.Cadence, item.PeriodStart, item.Stage })
            .IsUnique().HasFilter("\"UserProfileId\" IS NOT NULL");
        builder.HasIndex(item => new
            { item.HouseholdId, item.Scope, item.Cadence, item.PeriodStart, item.Stage })
            .IsUnique().HasFilter("\"UserProfileId\" IS NULL");
        builder.HasIndex(item => new { item.Stage, item.Status, item.AvailableAt, item.LeaseExpiresAt });
        builder.HasIndex(item => item.ClaimToken).HasFilter("\"ClaimToken\" IS NOT NULL");

        builder.ToTable(table => table.HasCheckConstraint(
            "CK_judgement_work_items_window",
            "\"PeriodEndExclusive\" > \"PeriodStart\""));
        builder.ToTable(table => table.HasCheckConstraint(
            "CK_judgement_work_items_generations",
            "\"RequestedGeneration\" >= \"ProcessedGeneration\" AND \"ProcessedGeneration\" >= 0"));
        builder.ToTable(table => table.HasCheckConstraint(
            "CK_judgement_work_items_attempts",
            "\"AttemptCount\" >= 0 AND \"MaxAttempts\" > 0"));
    }
}
