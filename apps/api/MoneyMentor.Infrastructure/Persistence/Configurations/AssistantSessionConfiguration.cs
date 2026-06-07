using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class AssistantSessionConfiguration : IEntityTypeConfiguration<AssistantSession>
{
    public void Configure(EntityTypeBuilder<AssistantSession> builder)
    {
        builder.ToTable("assistant_sessions", MoneyMentorDbContext.AppSchema);

        builder.HasKey(assistantSession => assistantSession.Id);

        builder.Property(assistantSession => assistantSession.Id)
            .ValueGeneratedNever();

        builder.Property(assistantSession => assistantSession.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(assistantSession => assistantSession.LastMessageAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<UserProfile>()
            .WithMany()
            .HasForeignKey(assistantSession => assistantSession.UserProfileId)
            .OnDelete(DeleteBehavior.Restrict)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(assistantSession => assistantSession.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasIndex(assistantSession => new
        {
            assistantSession.UserProfileId,
            assistantSession.HouseholdId
        });
    }
}
