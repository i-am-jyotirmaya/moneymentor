using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class HouseholdConfiguration : IEntityTypeConfiguration<Household>
{
    public void Configure(EntityTypeBuilder<Household> builder)
    {
        builder.ToTable("households", MoneyMentorDbContext.AppSchema);

        builder.HasKey(household => household.Id);

        builder.Property(household => household.Id)
            .ValueGeneratedNever();

        builder.Property(household => household.Name)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(household => household.Kind)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(household => household.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(household => household.UpdatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(household => household.CreatedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();
    }
}
