using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence.Configurations;

internal sealed class AssistantMessageConfiguration : IEntityTypeConfiguration<AssistantMessage>
{
    public void Configure(EntityTypeBuilder<AssistantMessage> builder)
    {
        builder.ToTable("assistant_messages", MoneyMentorDbContext.AppSchema);

        builder.HasKey(assistantMessage => assistantMessage.Id);

        builder.Property(assistantMessage => assistantMessage.Id)
            .ValueGeneratedNever();

        builder.Property(assistantMessage => assistantMessage.Role)
            .HasConversion<string>()
            .HasMaxLength(32)
            .IsRequired();

        builder.Property(assistantMessage => assistantMessage.Content)
            .HasMaxLength(8000)
            .IsRequired();

        builder.Property(assistantMessage => assistantMessage.Intent)
            .HasMaxLength(128);

        builder.Property(assistantMessage => assistantMessage.CreatedAt)
            .HasDefaultValueSql("now()");

        builder.HasOne<AssistantSession>()
            .WithMany()
            .HasForeignKey(assistantMessage => assistantMessage.SessionId)
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired();
    }
}
