using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgementScheduleConfiguration : IEntityTypeConfiguration<JudgementSchedule>
{
    public void Configure(EntityTypeBuilder<JudgementSchedule> builder)
    {
        builder.ToTable("judgement_schedules", MoneyMentorDbContext.AppSchema);
        builder.HasKey(schedule => schedule.Id);
        builder.Property(schedule => schedule.Id).ValueGeneratedNever();
        builder.Property(schedule => schedule.Scope).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(schedule => schedule.Cadence).HasConversion<string>().HasMaxLength(32).IsRequired();
        builder.Property(schedule => schedule.TimeZone).HasMaxLength(100).IsRequired();
        builder.Property(schedule => schedule.NextPeriodStart).HasColumnType("date").IsRequired();
        builder.Property(schedule => schedule.LastEnqueuedPeriodStart).HasColumnType("date");
        builder.Property(schedule => schedule.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(schedule => schedule.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasOne<Household>().WithMany().HasForeignKey(schedule => schedule.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade).IsRequired();
        builder.HasOne<UserProfile>().WithMany().HasForeignKey(schedule => schedule.UserProfileId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(schedule => new
            { schedule.HouseholdId, schedule.UserProfileId, schedule.Scope, schedule.Cadence })
            .IsUnique().HasFilter("\"UserProfileId\" IS NOT NULL");
        builder.HasIndex(schedule => new { schedule.HouseholdId, schedule.Scope, schedule.Cadence })
            .IsUnique().HasFilter("\"UserProfileId\" IS NULL");
        builder.HasIndex(schedule => new { schedule.IsActive, schedule.NextDueAt });
    }
}
