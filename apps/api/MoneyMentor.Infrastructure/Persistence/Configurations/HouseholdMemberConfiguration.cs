using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class HouseholdMemberConfiguration : IEntityTypeConfiguration<HouseholdMember>
{
    public void Configure(EntityTypeBuilder<HouseholdMember> builder)
    {
        builder.ToTable("household_members", MoneyMentorDbContext.AppSchema);

        builder.HasKey(householdMember => householdMember.Id);

        builder.Property(householdMember => householdMember.Id)
            .ValueGeneratedNever();

        builder.Property(householdMember => householdMember.Role)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(householdMember => householdMember.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(householdMember => householdMember.JoinedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(householdMember => householdMember.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(householdMember => householdMember.UserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();

        builder.HasIndex(householdMember => new
            {
                householdMember.HouseholdId,
                householdMember.UserProfileId
            })
            .IsUnique();
    }
}
