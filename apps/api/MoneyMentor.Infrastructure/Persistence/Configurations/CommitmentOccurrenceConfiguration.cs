using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class CommitmentOccurrenceConfiguration : IEntityTypeConfiguration<CommitmentOccurrence>
{
    public void Configure(EntityTypeBuilder<CommitmentOccurrence> builder)
    {
        builder.ToTable("commitment_occurrences", MoneyMentorDbContext.AppSchema);
        builder.HasKey(occurrence => occurrence.Id);
        builder.Property(occurrence => occurrence.Id).ValueGeneratedNever();
        builder.Property(occurrence => occurrence.DueDate).HasColumnType("date").IsRequired();
        builder.Property(occurrence => occurrence.ExpectedAmount).HasPrecision(18, 2).IsRequired();
        builder.Property(occurrence => occurrence.TransactionType).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(occurrence => occurrence.Status).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(occurrence => occurrence.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(occurrence => occurrence.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasOne<Commitment>().WithMany().HasForeignKey(occurrence => occurrence.CommitmentId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<Household>().WithMany().HasForeignKey(occurrence => occurrence.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(occurrence => occurrence.UserProfileId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.HasOne<Transaction>().WithMany().HasForeignKey(occurrence => occurrence.MatchedTransactionId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(occurrence => new { occurrence.CommitmentId, occurrence.DueDate }).IsUnique();
        builder.HasIndex(occurrence => new { occurrence.HouseholdId, occurrence.Status, occurrence.DueDate });
        builder.HasIndex(occurrence => occurrence.UserProfileId);
        builder.HasIndex(occurrence => occurrence.MatchedTransactionId);

        builder.ToTable(table => table.HasCheckConstraint(
            "CK_commitment_occurrences_expected_amount",
            "\"ExpectedAmount\" >= 0"));
    }
}
