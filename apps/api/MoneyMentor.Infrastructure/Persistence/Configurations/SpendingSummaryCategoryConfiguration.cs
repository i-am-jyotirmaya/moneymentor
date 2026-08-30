using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class SpendingSummaryCategoryConfiguration : IEntityTypeConfiguration<SpendingSummaryCategory>
{
    public void Configure(EntityTypeBuilder<SpendingSummaryCategory> builder)
    {
        builder.ToTable("spending_summary_categories", MoneyMentorDbContext.AppSchema);
        builder.HasKey(category => category.Id);
        builder.Property(category => category.Id).ValueGeneratedNever();
        builder.Property(category => category.SubjectKey).HasMaxLength(128).IsRequired();
        builder.Property(category => category.CategoryNameSnapshot).HasMaxLength(128).IsRequired();
        builder.Property(category => category.ParentCategoryNameSnapshot).HasMaxLength(128);
        builder.Property(category => category.ClassificationSnapshot).HasConversion<string>().HasMaxLength(32);
        builder.Property(category => category.Amount).HasPrecision(18, 2).IsRequired();
        builder.Property(category => category.Share).HasPrecision(20, 8);
        builder.Property(category => category.PreviousAmount).HasPrecision(18, 2);
        builder.Property(category => category.PreviousDeltaAmount).HasPrecision(18, 2);
        builder.Property(category => category.PreviousDeltaPercent).HasPrecision(20, 8);
        builder.Property(category => category.PreviousTrend).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(category => category.BaselineAmount).HasPrecision(18, 2);
        builder.Property(category => category.BaselineDeltaAmount).HasPrecision(18, 2);
        builder.Property(category => category.BaselineDeltaPercent).HasPrecision(20, 8);
        builder.Property(category => category.BaselineTrend).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(category => category.PreviousShare).HasPrecision(20, 8);
        builder.Property(category => category.PreviousShareDeltaPoints).HasPrecision(20, 8);
        builder.Property(category => category.BaselineShare).HasPrecision(20, 8);
        builder.Property(category => category.BaselineShareDeltaPoints).HasPrecision(20, 8);
        builder.Property(category => category.Direction).HasConversion<string>().HasMaxLength(16).IsRequired();

        builder.HasOne<SpendingSummary>().WithMany().HasForeignKey(category => category.SpendingSummaryId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<Category>().WithMany().HasForeignKey(category => category.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<Category>().WithMany().HasForeignKey(category => category.ParentCategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(category => new { category.SpendingSummaryId, category.SubjectKey }).IsUnique();
        builder.HasIndex(category => category.CategoryId);
        builder.HasIndex(category => category.ParentCategoryId);
    }
}
