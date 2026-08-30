using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class SpendingSummaryConfiguration : IEntityTypeConfiguration<SpendingSummary>
{
    public void Configure(EntityTypeBuilder<SpendingSummary> builder)
    {
        builder.ToTable("spending_summaries", MoneyMentorDbContext.AppSchema);
        builder.HasKey(summary => summary.Id);
        builder.Property(summary => summary.Id).ValueGeneratedNever();

        builder.Property(summary => summary.Scope).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.Cadence).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.WindowStart).HasColumnType("date").IsRequired();
        builder.Property(summary => summary.WindowEndExclusive).HasColumnType("date").IsRequired();
        builder.Property(summary => summary.TimeZone).HasMaxLength(100).IsRequired();
        builder.Property(summary => summary.CurrencyCode).HasMaxLength(3).IsFixedLength().IsRequired();
        builder.Property(summary => summary.CalculationVersion).HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.RuleVersion).HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.Direction).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.Confidence).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(summary => summary.NarrationStatus).HasConversion<string>().HasMaxLength(32).IsRequired();

        ConfigureMoney(builder, summary => summary.Income);
        ConfigureMoney(builder, summary => summary.ExplicitSavings);
        ConfigureMoney(builder, summary => summary.ConsumptionSpend);
        ConfigureMoney(builder, summary => summary.EssentialSpend);
        ConfigureMoney(builder, summary => summary.DiscretionarySpend);
        ConfigureMoney(builder, summary => summary.DebtSpend);
        ConfigureMoney(builder, summary => summary.UncategorizedSpend);
        ConfigureMoney(builder, summary => summary.CashOutflow);
        ConfigureMoney(builder, summary => summary.OperatingSurplus);
        ConfigureMoney(builder, summary => summary.CashBalance);

        ConfigureRate(builder, summary => summary.SavingsRate);
        ConfigureRate(builder, summary => summary.SavingsAllocationRate);
        ConfigureRate(builder, summary => summary.ExpenseToIncomeRate);
        ConfigureRate(builder, summary => summary.EssentialShare);
        ConfigureRate(builder, summary => summary.DiscretionaryShare);
        ConfigureRate(builder, summary => summary.DebtShare);
        ConfigureRate(builder, summary => summary.UncategorizedShare);

        builder.Property(summary => summary.MetricsComparisonJson).HasColumnType("jsonb").IsRequired();
        builder.Property(summary => summary.DataQualityFlagsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(summary => summary.GoalInputsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(summary => summary.NarrationHeadline).HasMaxLength(256);
        builder.Property(summary => summary.NarrationOverview).HasMaxLength(2000);
        builder.Property(summary => summary.NarrationJson).HasColumnType("jsonb");
        builder.Property(summary => summary.NarrationModel).HasMaxLength(100);
        builder.Property(summary => summary.CalculatedAt).HasDefaultValueSql("now()");

        builder.HasOne<Household>().WithMany().HasForeignKey(summary => summary.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(summary => summary.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<SpendingSummary>().WithMany().HasForeignKey(summary => summary.PreviousSummaryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(summary => new
            {
                summary.HouseholdId,
                summary.UserProfileId,
                summary.Scope,
                summary.Cadence,
                summary.WindowStart,
                summary.Revision
            })
            .IsUnique()
            .HasFilter("\"UserProfileId\" IS NOT NULL");
        builder.HasIndex(summary => new
            {
                summary.HouseholdId,
                summary.Scope,
                summary.Cadence,
                summary.WindowStart,
                summary.Revision
            })
            .IsUnique()
            .HasFilter("\"UserProfileId\" IS NULL");
        builder.HasIndex(summary => new { summary.HouseholdId, summary.Status, summary.PublishedAt });
        builder.HasIndex(summary => summary.PreviousSummaryId);

        builder.ToTable(table => table.HasCheckConstraint(
            "CK_spending_summaries_window",
            "\"WindowEndExclusive\" > \"WindowStart\""));
        builder.ToTable(table => table.HasCheckConstraint(
            "CK_spending_summaries_revision",
            "\"Revision\" > 0"));
    }

    private static void ConfigureMoney(
        EntityTypeBuilder<SpendingSummary> builder,
        System.Linq.Expressions.Expression<Func<SpendingSummary, decimal>> property) =>
        builder.Property(property).HasPrecision(18, 2).IsRequired();

    private static void ConfigureRate(
        EntityTypeBuilder<SpendingSummary> builder,
        System.Linq.Expressions.Expression<Func<SpendingSummary, decimal?>> property) =>
        builder.Property(property).HasPrecision(20, 8);
}
