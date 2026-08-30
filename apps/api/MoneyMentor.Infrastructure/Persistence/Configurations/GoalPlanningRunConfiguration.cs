using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class GoalPlanningRunConfiguration : IEntityTypeConfiguration<GoalPlanningRun>
{
    public void Configure(EntityTypeBuilder<GoalPlanningRun> builder)
    {
        builder.ToTable("goal_planning_runs", MoneyMentorDbContext.AppSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.RunType).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.RequestJson).HasColumnType("jsonb").IsRequired();
        builder.Property(item => item.SnapshotJson).HasColumnType("jsonb").IsRequired();
        builder.Property(item => item.Model).HasMaxLength(100);
        builder.Property(item => item.PromptVersion).HasMaxLength(32).IsRequired();
        builder.Property(item => item.SchemaVersion).HasMaxLength(32).IsRequired();
        builder.Property(item => item.FailureCategory).HasMaxLength(64);
        builder.Property(item => item.Error).HasMaxLength(1000);
        builder.Property(item => item.IdempotencyKey).HasMaxLength(128).IsRequired();
        builder.HasOne<FinancialGoal>().WithMany().HasForeignKey(item => item.GoalId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(item => item.RequestedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict).IsRequired();
        builder.HasOne<GoalPlanVersion>().WithMany().HasForeignKey(item => item.SourceVersionId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<GoalPlanVersion>().WithMany().HasForeignKey(item => item.ResultVersionId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(item => new { item.RequestedByUserProfileId, item.IdempotencyKey }).IsUnique();
        builder.HasIndex(item => new { item.Status, item.CreatedAt });
    }
}
