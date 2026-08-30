using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class HouseholdInvitationConfiguration : IEntityTypeConfiguration<HouseholdInvitation>
{
    public void Configure(EntityTypeBuilder<HouseholdInvitation> builder)
    {
        builder.ToTable("household_invitations", MoneyMentorDbContext.AppSchema);

        builder.HasKey(invitation => invitation.Id);

        builder.Property(invitation => invitation.Id)
            .ValueGeneratedNever();

        builder.Property(invitation => invitation.Email)
            .HasMaxLength(256)
            .IsRequired();

        builder.Property(invitation => invitation.Role)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(invitation => invitation.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(invitation => invitation.DeliveryStatus)
            .HasConversion<string>()
            .HasMaxLength(32)
            .HasDefaultValue(InvitationDeliveryStatus.Unknown)
            .IsRequired();

        builder.Property(invitation => invitation.DeliveryId)
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(invitation => invitation.ProviderMessageId)
            .HasMaxLength(256);

        builder.Property(invitation => invitation.LastDeliveryError)
            .HasMaxLength(1024);

        builder.Property(invitation => invitation.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(invitation => invitation.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(invitation => invitation.InvitedByUserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(invitation => invitation.RespondedByUserProfileId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(invitation => new
            {
                invitation.HouseholdId,
                invitation.Email
            })
            .IsUnique()
            .HasFilter("\"Status\" = 'Pending'");

        builder.HasIndex(invitation => new
        {
            invitation.Email,
            invitation.Status,
            invitation.ExpiresAt
        });

        builder.HasIndex(invitation => new
        {
            invitation.DeliveryStatus,
            invitation.NextDeliveryAttemptAt
        });

        builder.HasIndex(invitation => invitation.DeliveryId)
            .IsUnique();
    }
}
