using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.ToTable("transactions", MoneyMentorDbContext.AppSchema);

        builder.HasKey(transaction => transaction.Id);

        builder.Property(transaction => transaction.Id)
            .ValueGeneratedNever();

        builder.Property(transaction => transaction.Amount)
            .HasPrecision(18, 2)
            .IsRequired();

        builder.Property(transaction => transaction.Type)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(transaction => transaction.MerchantName)
            .HasMaxLength(256);

        builder.Property(transaction => transaction.Description)
            .HasMaxLength(1024);

        builder.Property(transaction => transaction.SourceText)
            .HasMaxLength(4000)
            .IsRequired();

        builder.Property(transaction => transaction.InputMode)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(transaction => transaction.Confidence)
            .HasPrecision(5, 4)
            .IsRequired();

        builder.Property(transaction => transaction.Visibility)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(transaction => transaction.UpdatedByUserProfileId);

        builder.Property(transaction => transaction.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(transaction => transaction.UpdatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(transaction => transaction.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(transaction => transaction.UserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(transaction => transaction.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(transaction => transaction.UpdatedByUserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(transaction => transaction.HouseholdId);
        builder.HasIndex(transaction => transaction.UserProfileId);
        builder.HasIndex(transaction => transaction.UpdatedByUserProfileId);
        builder.HasIndex(transaction => transaction.TransactionDate);
        builder.HasIndex(transaction => transaction.CategoryId);
    }
}
