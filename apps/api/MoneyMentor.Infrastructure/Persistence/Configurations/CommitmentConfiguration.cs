using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class CommitmentConfiguration : IEntityTypeConfiguration<Commitment>
{
    public void Configure(EntityTypeBuilder<Commitment> builder)
    {
        builder.ToTable("commitments", MoneyMentorDbContext.AppSchema);

        builder.HasKey(commitment => commitment.Id);

        builder.Property(commitment => commitment.Id)
            .ValueGeneratedNever();

        builder.Property(commitment => commitment.Name)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(commitment => commitment.TransactionType)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(commitment => commitment.Amount)
            .HasPrecision(18, 2)
            .IsRequired();

        builder.Property(commitment => commitment.Cadence)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(commitment => commitment.NextDueDate)
            .HasColumnType("date")
            .IsRequired();

        builder.Property(commitment => commitment.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(commitment => commitment.UpdatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(commitment => commitment.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(commitment => commitment.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(commitment => commitment.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne<FinancialGoal>()
            .WithMany()
            .HasForeignKey(commitment => commitment.GoalId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(commitment => new { commitment.HouseholdId, commitment.IsActive, commitment.NextDueDate });
        builder.HasIndex(commitment => commitment.UserProfileId);
        builder.HasIndex(commitment => commitment.CategoryId);
        builder.HasIndex(commitment => commitment.GoalId);

        builder.ToTable(table =>
            table.HasCheckConstraint(
                "CK_commitments_supported_transaction_type",
                $"\"TransactionType\" IN ('{TransactionType.Expense}', '{TransactionType.Investment}')"));
    }
}
