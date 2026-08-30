using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class GoalPlanVersionConfiguration : IEntityTypeConfiguration<GoalPlanVersion>
{
    public void Configure(EntityTypeBuilder<GoalPlanVersion> builder)
    {
        builder.ToTable("goal_plan_versions", MoneyMentorDbContext.AppSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.Source).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(item => item.UserContext).HasMaxLength(1000);
        builder.HasOne<GoalPlan>().WithMany().HasForeignKey(item => item.GoalPlanId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<GoalPlanVersion>().WithMany().HasForeignKey(item => item.SourceVersionId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(item => item.CreatedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict).IsRequired();
        builder.HasIndex(item => new { item.GoalPlanId, item.VersionNumber }).IsUnique();
    }
}
