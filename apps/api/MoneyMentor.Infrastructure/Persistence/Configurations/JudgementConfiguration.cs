using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgementConfiguration : IEntityTypeConfiguration<Judgement>
{
    public void Configure(EntityTypeBuilder<Judgement> builder)
    {
        builder.ToTable("judgements", MoneyMentorDbContext.AppSchema);

        builder.HasKey(judgement => judgement.Id);

        builder.Property(judgement => judgement.Id)
            .ValueGeneratedNever();

        builder.Property(judgement => judgement.RuleCode)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(judgement => judgement.DeduplicationKey)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(judgement => judgement.IssueKey)
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(judgement => judgement.SubjectKey)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(judgement => judgement.SubjectType)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Period)
            .HasColumnType("date")
            .IsRequired();

        builder.Property(judgement => judgement.Scope)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Cadence)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Direction)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Severity)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Tone)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.Title)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(judgement => judgement.Value)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(judgement => judgement.Message)
            .HasMaxLength(1024)
            .IsRequired();

        builder.Property(judgement => judgement.InputsJson)
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(judgement => judgement.FocusMetric)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(judgement => judgement.EvidenceJson)
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(judgement => judgement.ThresholdsJson)
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(judgement => judgement.ActionCode)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(judgement => judgement.ActionParametersJson)
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(judgement => judgement.CalculationVersion)
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.RuleVersion)
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(judgement => judgement.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(judgement => judgement.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(judgement => judgement.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne<SpendingSummary>()
            .WithMany()
            .HasForeignKey(judgement => judgement.SpendingSummaryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<SpendingSummary>()
            .WithMany()
            .HasForeignKey(judgement => judgement.ResolvingSummaryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Judgement>()
            .WithMany()
            .HasForeignKey(judgement => judgement.SupersedesJudgementId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Judgement>()
            .WithMany()
            .HasForeignKey(judgement => judgement.SupersededByJudgementId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(judgement => judgement.DismissedByUserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(judgement => new
            {
                judgement.HouseholdId,
                judgement.UserProfileId,
                judgement.Period,
                judgement.RuleCode,
                judgement.DeduplicationKey
            })
            .IsUnique()
            .HasFilter("\"DismissedAt\" IS NULL");

        builder.HasIndex(judgement => new { judgement.SubjectType, judgement.SubjectId, judgement.Period });
        builder.HasIndex(judgement => judgement.DismissedByUserProfileId);
        builder.HasIndex(judgement => new { judgement.SpendingSummaryId, judgement.IssueKey })
            .IsUnique()
            .HasFilter("\"SpendingSummaryId\" IS NOT NULL");
        builder.HasIndex(judgement => new
        {
            judgement.HouseholdId,
            judgement.UserProfileId,
            judgement.Scope,
            judgement.Cadence,
            judgement.Status,
            judgement.ExpiresAt
        });
        builder.HasIndex(judgement => judgement.ResolvingSummaryId);
        builder.HasIndex(judgement => judgement.SupersedesJudgementId);
        builder.HasIndex(judgement => judgement.SupersededByJudgementId);
    }
}
