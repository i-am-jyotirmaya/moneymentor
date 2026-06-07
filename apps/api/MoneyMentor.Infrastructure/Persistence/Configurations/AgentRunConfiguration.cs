using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class AgentRunConfiguration : IEntityTypeConfiguration<AgentRun>
{
    public void Configure(EntityTypeBuilder<AgentRun> builder)
    {
        builder.ToTable("agent_runs", MoneyMentorDbContext.AppSchema);

        builder.HasKey(agentRun => agentRun.Id);

        builder.Property(agentRun => agentRun.Id)
            .ValueGeneratedNever();

        builder.Property(agentRun => agentRun.AgentName)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(agentRun => agentRun.TriggerType)
            .HasMaxLength(128)
            .IsRequired();

        builder.Property(agentRun => agentRun.Status)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(agentRun => agentRun.StartedAt)
            .HasDefaultValueSql("now()");

        builder.Property(agentRun => agentRun.Error)
            .HasMaxLength(4000);

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(agentRun => agentRun.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();

        builder.HasIndex(agentRun => new
        {
            agentRun.HouseholdId,
            agentRun.AgentName,
            agentRun.StartedAt
        });
    }
}
