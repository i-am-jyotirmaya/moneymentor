using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class JudgementRuleConfiguration : IEntityTypeConfiguration<JudgementRule>
{
    public void Configure(EntityTypeBuilder<JudgementRule> builder)
    {
        builder.ToTable("judgement_rules", MoneyMentorDbContext.AppSchema);

        builder.HasKey(rule => rule.Id);

        builder.Property(rule => rule.Id)
            .ValueGeneratedNever();

        builder.Property(rule => rule.Code)
            .HasMaxLength(64)
            .IsRequired();

        builder.Property(rule => rule.Category)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(rule => rule.Severity)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(rule => rule.Cadence)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(rule => rule.Scope)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(rule => rule.RuleVersion)
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(rule => rule.ParamsJson)
            .HasColumnType("jsonb")
            .IsRequired();

        builder.Property(rule => rule.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.Property(rule => rule.UpdatedAt)
            .HasDefaultValueSql("now()");

        builder.HasIndex(rule => new { rule.Code, rule.Cadence, rule.Scope, rule.RuleVersion })
            .IsUnique();
    }
}
