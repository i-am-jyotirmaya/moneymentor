using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Domain.Entities;

public sealed class AssistantMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid SessionId { get; set; }

    public MessageRole Role { get; set; }

    public string Content { get; set; } = string.Empty;

    public string? Intent { get; set; }

    public string? ParsedDataJson { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
