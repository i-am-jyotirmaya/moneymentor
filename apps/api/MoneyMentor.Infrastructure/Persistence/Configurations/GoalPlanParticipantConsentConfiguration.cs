using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class GoalPlanParticipantConsentConfiguration : IEntityTypeConfiguration<GoalPlanParticipantConsent>
{
    public void Configure(EntityTypeBuilder<GoalPlanParticipantConsent> builder)
    {
        builder.ToTable("goal_plan_participant_consents", MoneyMentorDbContext.AppSchema);
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Id).ValueGeneratedNever();
        builder.Property(item => item.PolicyVersion).HasMaxLength(64).IsRequired();
        builder.HasOne<FinancialGoal>().WithMany().HasForeignKey(item => item.GoalId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(item => item.UserProfileId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasIndex(item => new { item.GoalId, item.UserProfileId }).IsUnique();
    }
}
