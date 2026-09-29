using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgmentCandidateConfiguration : IEntityTypeConfiguration<JudgmentCandidate>
{
    public void Configure(EntityTypeBuilder<JudgmentCandidate> builder)
    {
        builder.ToTable("judgment_candidates", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Scope).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.CandidateType).HasMaxLength(64);
        builder.Property(x => x.SubjectType).HasMaxLength(32);
        builder.Property(x => x.SubjectKey).HasMaxLength(128);
        builder.Property(x => x.DeduplicationKey).HasMaxLength(128);
        builder.Property(x => x.WindowStart).HasColumnType("date");
        builder.Property(x => x.WindowEndExclusive).HasColumnType("date");
        builder.Property(x => x.CurrentValue).HasPrecision(18, 2);
        builder.Property(x => x.BaselineValue).HasPrecision(18, 2);
        builder.Property(x => x.DeviationRatio).HasPrecision(12, 4);
        builder.Property(x => x.InterestingnessScore).HasPrecision(5, 4);
        builder.Property(x => x.DetectorConfidence).HasPrecision(5, 4);
        builder.Property(x => x.EvidenceJson).HasColumnType("jsonb");
        builder.Property(x => x.DetectorVersion).HasMaxLength(32);
        builder.Property(x => x.CalculationVersion).HasMaxLength(32);
        builder.HasOne<Household>().WithMany().HasForeignKey(x => x.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.UserProfileId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(x => x.DeduplicationKey).IsUnique();
        builder.HasIndex(x => new { x.HouseholdId, x.UserProfileId, x.Status, x.CreatedAt });
        builder.HasIndex(x => new { x.Status, x.AvailableAt });
        builder.HasIndex(x => new { x.CandidateType, x.SubjectKey, x.WindowStart });
    }
}
