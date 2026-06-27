using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class TransactionAuditEntryConfiguration : IEntityTypeConfiguration<TransactionAuditEntry>
{
    public void Configure(EntityTypeBuilder<TransactionAuditEntry> builder)
    {
        builder.ToTable("transaction_audit_entries", MoneyMentorDbContext.AppSchema);

        builder.HasKey(auditEntry => auditEntry.Id);

        builder.Property(auditEntry => auditEntry.Id)
            .ValueGeneratedNever();

        builder.Property(auditEntry => auditEntry.ChangedFieldsJson)
            .IsRequired();

        builder.Property(auditEntry => auditEntry.EditedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Transaction>()
            .WithMany()
            .HasForeignKey(auditEntry => auditEntry.TransactionId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(auditEntry => auditEntry.EditedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();

        builder.HasIndex(auditEntry => auditEntry.TransactionId);
        builder.HasIndex(auditEntry => auditEntry.EditedByUserProfileId);
        builder.HasIndex(auditEntry => auditEntry.EditedAt);
    }
}
