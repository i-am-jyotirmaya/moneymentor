using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class GoalContributionConfiguration : IEntityTypeConfiguration<GoalContribution>
{
    public void Configure(EntityTypeBuilder<GoalContribution> builder)
    {
        builder.ToTable("goal_contributions", MoneyMentorDbContext.AppSchema);

        builder.HasKey(contribution => contribution.Id);

        builder.Property(contribution => contribution.Id)
            .ValueGeneratedNever();

        builder.Property(contribution => contribution.Amount)
            .HasPrecision(18, 2)
            .IsRequired();

        builder.Property(contribution => contribution.ContributedAt)
            .HasColumnType("date")
            .IsRequired();

        builder.Property(contribution => contribution.Source)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(contribution => contribution.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<FinancialGoal>()
            .WithMany()
            .HasForeignKey(contribution => contribution.GoalId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(contribution => contribution.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne<Transaction>()
            .WithMany()
            .HasForeignKey(contribution => contribution.TransactionId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne<Commitment>()
            .WithMany()
            .HasForeignKey(contribution => contribution.CommitmentId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(contribution => new { contribution.GoalId, contribution.ContributedAt });
        builder.HasIndex(contribution => contribution.UserProfileId);
        builder.HasIndex(contribution => contribution.TransactionId);
        builder.HasIndex(contribution => contribution.CommitmentId);
    }
}
