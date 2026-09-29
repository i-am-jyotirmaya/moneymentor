using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class MerchantConfiguration : IEntityTypeConfiguration<Merchant>
{
    public void Configure(EntityTypeBuilder<Merchant> builder)
    {
        builder.ToTable("merchants", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.CanonicalName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.NormalizedName).HasMaxLength(256).IsRequired();
        builder.HasOne<Household>().WithMany().HasForeignKey(x => x.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.HouseholdId, x.NormalizedName }).IsUnique();
    }
}

internal sealed class MerchantAliasConfiguration : IEntityTypeConfiguration<MerchantAlias>
{
    public void Configure(EntityTypeBuilder<MerchantAlias> builder)
    {
        builder.ToTable("merchant_aliases", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Alias).HasMaxLength(256).IsRequired();
        builder.Property(x => x.NormalizedAlias).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Source).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Confidence).HasPrecision(5, 4);
        builder.HasOne<Merchant>().WithMany().HasForeignKey(x => x.MerchantId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.MerchantId, x.NormalizedAlias }).IsUnique();
        builder.HasIndex(x => x.NormalizedAlias);
    }
}
