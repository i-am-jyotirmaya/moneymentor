using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class GoalPlanConfiguration : IEntityTypeConfiguration<GoalPlan>
{
    public void Configure(EntityTypeBuilder<GoalPlan> builder)
    {
        builder.ToTable("goal_plans", MoneyMentorDbContext.AppSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.LastActivationIdempotencyKey).HasMaxLength(128);
        builder.HasOne<FinancialGoal>().WithMany().HasForeignKey(item => item.GoalId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(item => item.CreatedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict).IsRequired();
        builder.HasOne<GoalPlanVersion>().WithMany().HasForeignKey(item => item.ActiveVersionId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(item => item.GoalId).IsUnique();
    }
}
