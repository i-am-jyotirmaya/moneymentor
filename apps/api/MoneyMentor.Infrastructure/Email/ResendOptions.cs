namespace MoneyMentor.Infrastructure.Email;

public sealed class ResendOptions
{
    public const string SectionName = "Resend";

    public bool DispatcherEnabled { get; init; }

    public string ApiKey { get; init; } = string.Empty;

    public string FromAddress { get; init; } = string.Empty;

    public string? ReplyTo { get; init; }
}
