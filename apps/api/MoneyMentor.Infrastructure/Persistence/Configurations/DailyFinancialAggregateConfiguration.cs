using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class DailyFinancialAggregateConfiguration : IEntityTypeConfiguration<DailyFinancialAggregate>
{
    public void Configure(EntityTypeBuilder<DailyFinancialAggregate> builder)
    {
        builder.ToTable("daily_financial_aggregates", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Date).HasColumnType("date");
        builder.Property(x => x.Visibility).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.CalculationVersion).HasMaxLength(32);
        foreach (var name in new[] { nameof(DailyFinancialAggregate.Income), nameof(DailyFinancialAggregate.Expense),
            nameof(DailyFinancialAggregate.EssentialSpend), nameof(DailyFinancialAggregate.DiscretionarySpend),
            nameof(DailyFinancialAggregate.DebtSpend), nameof(DailyFinancialAggregate.InvestmentAmount),
            nameof(DailyFinancialAggregate.AverageTransactionAmount), nameof(DailyFinancialAggregate.MaximumTransactionAmount) })
            builder.Property<decimal>(name).HasPrecision(18, 2);
        builder.HasOne<Household>().WithMany().HasForeignKey(x => x.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.UserProfileId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<Category>().WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(x => new { x.HouseholdId, x.UserProfileId, x.Date, x.Visibility, x.CategoryId })
            .IsUnique().AreNullsDistinct(false);
        builder.HasIndex(x => new { x.HouseholdId, x.Date, x.CategoryId });
    }
}
