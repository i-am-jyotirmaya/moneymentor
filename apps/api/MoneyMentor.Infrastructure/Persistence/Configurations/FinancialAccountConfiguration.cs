using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;
namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class FinancialAccountConfiguration : IEntityTypeConfiguration<FinancialAccount>
{
    public void Configure(EntityTypeBuilder<FinancialAccount> builder)
    {
        builder.ToTable("financial_accounts", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Name).HasMaxLength(128).IsRequired();
        builder.Property(x => x.AccountType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Institution).HasMaxLength(128);
        builder.Property(x => x.Last4).HasMaxLength(4);
        builder.Property(x => x.CurrencyCode).HasMaxLength(3).IsRequired();
        builder.Property(x => x.MetadataJson).HasColumnType("jsonb");
        builder.HasOne<Household>().WithMany().HasForeignKey(x => x.HouseholdId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(x => x.OwnerUserProfileId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => x.HouseholdId);
    }
}
internal sealed class FinancialAccountAliasConfiguration : IEntityTypeConfiguration<FinancialAccountAlias>
{
    public void Configure(EntityTypeBuilder<FinancialAccountAlias> builder)
    {
        builder.ToTable("financial_account_aliases", MoneyMentorDbContext.AppSchema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Alias).HasMaxLength(128).IsRequired();
        builder.HasOne<FinancialAccount>().WithMany().HasForeignKey(x => x.FinancialAccountId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(x => new { x.FinancialAccountId, x.Alias }).IsUnique();
    }
}
