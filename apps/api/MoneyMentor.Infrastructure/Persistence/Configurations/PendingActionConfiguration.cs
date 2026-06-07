using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class PendingActionConfiguration : IEntityTypeConfiguration<PendingAction>
{
    public void Configure(EntityTypeBuilder<PendingAction> builder)
    {
        builder.ToTable("pending_actions", MoneyMentorDbContext.AppSchema);

        builder.HasKey(pendingAction => pendingAction.Id);

        builder.Property(pendingAction => pendingAction.Id)
            .ValueGeneratedNever();

        builder.Property(pendingAction => pendingAction.ActionType)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(pendingAction => pendingAction.PayloadJson)
            .IsRequired();

        builder.Property(pendingAction => pendingAction.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(pendingAction => pendingAction.UserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(pendingAction => pendingAction.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();
    }
}
