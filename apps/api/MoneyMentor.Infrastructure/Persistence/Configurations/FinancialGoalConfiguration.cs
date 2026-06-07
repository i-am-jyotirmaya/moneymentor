using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class FinancialGoalConfiguration : IEntityTypeConfiguration<FinancialGoal>
{
    public void Configure(EntityTypeBuilder<FinancialGoal> builder)
    {
        builder.ToTable("financial_goals", MoneyMentorDbContext.AppSchema);

        builder.HasKey(financialGoal => financialGoal.Id);

        builder.Property(financialGoal => financialGoal.Id)
            .ValueGeneratedNever();

        builder.Property(financialGoal => financialGoal.Name)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(financialGoal => financialGoal.TargetAmount)
            .HasPrecision(18, 2)
            .IsRequired();

        builder.Property(financialGoal => financialGoal.CurrentAmount)
            .HasPrecision(18, 2)
            .IsRequired();

        builder.Property(financialGoal => financialGoal.Priority)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(financialGoal => financialGoal.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(financialGoal => financialGoal.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(financialGoal => financialGoal.UpdatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(financialGoal => financialGoal.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(financialGoal => financialGoal.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(financialGoal => new
        {
            financialGoal.HouseholdId,
            financialGoal.UserProfileId,
            financialGoal.Status
        });
    }
}
