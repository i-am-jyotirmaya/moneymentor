using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;
namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class TransactionRelationConfiguration : IEntityTypeConfiguration<TransactionRelation>
{
    public void Configure(EntityTypeBuilder<TransactionRelation> builder)
    {
        builder.ToTable("transaction_relations", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.RelationType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Confidence).HasPrecision(5, 4);
        builder.HasOne<Transaction>().WithMany().HasForeignKey(x => x.TransactionId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Transaction>().WithMany().HasForeignKey(x => x.RelatedTransactionId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.TransactionId, x.RelatedTransactionId, x.RelationType }).IsUnique();
        builder.HasIndex(x => x.RelatedTransactionId);
    }
}
