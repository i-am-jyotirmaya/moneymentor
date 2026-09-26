using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class FinancialContextMemoryConfiguration : IEntityTypeConfiguration<FinancialContextMemory>
{
    public void Configure(EntityTypeBuilder<FinancialContextMemory> builder)
    {
        builder.ToTable("financial_context_memories", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.MemoryType).HasMaxLength(64);
        builder.Property(x => x.Text).HasMaxLength(2000);
        builder.Property(x => x.StructuredDataJson).HasColumnType("jsonb");
        builder.Property(x => x.SourceType).HasMaxLength(32);
        builder.Property(x => x.Confidence).HasPrecision(5, 4);
        builder.Property(x => x.Importance).HasPrecision(5, 2);
        builder.Property(x => x.EmbeddingModel).HasMaxLength(100);
        builder.HasOne<Household>().WithMany().HasForeignKey(x => x.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.UserProfileId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Judgement>().WithMany().HasForeignKey(x => x.SourceJudgementId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<AssistantMessage>().WithMany().HasForeignKey(x => x.SourceMessageId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<JudgmentFeedback>().WithMany().HasForeignKey(x => x.SourceFeedbackId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(x => x.SourceFeedbackId).IsUnique();
        builder.HasIndex(x => new { x.HouseholdId, x.UserProfileId, x.IsActive, x.ValidUntil, x.MemoryType });
        builder.HasIndex(x => new { x.HouseholdId, x.Visibility, x.IsActive, x.ValidUntil });
    }
}

internal sealed class JudgmentFeedbackConfiguration : IEntityTypeConfiguration<JudgmentFeedback>
{
    public void Configure(EntityTypeBuilder<JudgmentFeedback> builder)
    {
        builder.ToTable("judgment_feedback", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Text).HasMaxLength(2000);
        builder.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Status).HasMaxLength(32);
        builder.HasOne<Household>().WithMany().HasForeignKey(x => x.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.UserProfileId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Judgement>().WithMany().HasForeignKey(x => x.JudgementId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.Status, x.AvailableAt });
        builder.HasIndex(x => new { x.HouseholdId, x.UserProfileId, x.CreatedAt });
    }
}
