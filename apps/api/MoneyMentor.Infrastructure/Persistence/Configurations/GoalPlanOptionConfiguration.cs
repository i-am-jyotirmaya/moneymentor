using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class GoalPlanOptionConfiguration : IEntityTypeConfiguration<GoalPlanOption>
{
    public void Configure(EntityTypeBuilder<GoalPlanOption> builder)
    {
        builder.ToTable("goal_plan_options", MoneyMentorDbContext.AppSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.Pace).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.Feasibility).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.MonthlyContribution).HasPrecision(18, 2).IsRequired();
        builder.Property(item => item.Title).HasMaxLength(100).IsRequired();
        builder.Property(item => item.Explanation).HasMaxLength(2000).IsRequired();
        builder.Property(item => item.TradeOffsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(item => item.AssumptionsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(item => item.RisksJson).HasColumnType("jsonb").IsRequired();
        builder.Property(item => item.MilestonesJson).HasColumnType("jsonb").IsRequired();
        builder.Property(item => item.CalculationVersion).HasMaxLength(32).IsRequired();
        builder.HasOne<GoalPlanVersion>().WithMany().HasForeignKey(item => item.GoalPlanVersionId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasIndex(item => new { item.GoalPlanVersionId, item.SortOrder }).IsUnique();
    }
}
