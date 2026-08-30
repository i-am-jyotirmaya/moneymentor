using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("categories", MoneyMentorDbContext.AppSchema);

        builder.HasKey(category => category.Id);

        builder.Property(category => category.Id)
            .ValueGeneratedNever();

        builder.Property(category => category.Name)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(category => category.Type)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(category => category.Classification)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(category => category.KeywordsJson)
            .IsRequired();

        builder.Property(category => category.Icon)
            .HasMaxLength(64);

        builder.Property(category => category.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(category => category.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(category => category.ParentCategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(category => new
            {
                category.HouseholdId,
                category.ParentCategoryId,
                category.Name
            })
            .IsUnique();

        builder.ToTable(table =>
            table.HasCheckConstraint(
                "CK_categories_no_self_parent",
                "\"ParentCategoryId\" IS NULL OR \"ParentCategoryId\" <> \"Id\""));
    }
}
