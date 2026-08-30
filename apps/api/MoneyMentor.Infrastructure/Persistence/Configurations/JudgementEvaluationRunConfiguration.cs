using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgementEvaluationRunConfiguration : IEntityTypeConfiguration<JudgementEvaluationRun>
{
    public void Configure(EntityTypeBuilder<JudgementEvaluationRun> builder)
    {
        builder.ToTable("judgement_evaluation_runs", MoneyMentorDbContext.AppSchema);
        builder.HasKey(run => run.Id);
        builder.Property(run => run.Id).ValueGeneratedNever();
        builder.Property(run => run.Stage).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(run => run.CalculationVersion).HasMaxLength(32).IsRequired();
        builder.Property(run => run.RuleVersion).HasMaxLength(32).IsRequired();
        builder.Property(run => run.NarrationSchemaVersion).HasMaxLength(32).IsRequired();
        builder.Property(run => run.DeterministicInputJson).HasColumnType("jsonb").IsRequired();
        builder.Property(run => run.NarrationOutputJson).HasColumnType("jsonb");
        builder.Property(run => run.Provider).HasMaxLength(64);
        builder.Property(run => run.Model).HasMaxLength(100);
        builder.Property(run => run.FailureCategory).HasMaxLength(64);
        builder.Property(run => run.Error).HasMaxLength(1000);

        builder.HasOne<SpendingSummary>().WithMany().HasForeignKey(run => run.SpendingSummaryId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<JudgementWorkItem>().WithMany().HasForeignKey(run => run.JudgementWorkItemId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(run => new { run.SpendingSummaryId, run.Stage, run.AttemptNumber }).IsUnique();
        builder.HasIndex(run => run.JudgementWorkItemId);
        builder.HasIndex(run => new { run.Stage, run.StartedAt });

        builder.ToTable(table => table.HasCheckConstraint(
            "CK_judgement_evaluation_runs_attempt",
            "\"AttemptNumber\" > 0"));
        builder.ToTable(table => table.HasCheckConstraint(
            "CK_judgement_evaluation_runs_usage",
            "\"InputTokens\" >= 0 AND \"OutputTokens\" >= 0 AND \"DurationMilliseconds\" >= 0"));
    }
}
