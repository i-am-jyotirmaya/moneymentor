using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgementUserStateConfiguration : IEntityTypeConfiguration<JudgementUserState>
{
    public void Configure(EntityTypeBuilder<JudgementUserState> builder)
    {
        builder.ToTable("judgement_user_states", MoneyMentorDbContext.AppSchema);
        builder.HasKey(state => state.Id);
        builder.Property(state => state.Id).ValueGeneratedNever();
        builder.Property(state => state.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(state => state.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasOne<Judgement>().WithMany().HasForeignKey(state => state.JudgementId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(state => state.UserProfileId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();

        builder.HasIndex(state => new { state.JudgementId, state.UserProfileId }).IsUnique();
        builder.HasIndex(state => new { state.UserProfileId, state.DismissedAt, state.SnoozedUntil });
    }
}
