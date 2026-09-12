namespace MoneyMentor.Infrastructure.Email;

public sealed class SesOptions
{
    public const string SectionName = "SES";

    public bool DispatcherEnabled { get; init; }
    public string FromAddress { get; init; } = string.Empty;
    public string? ReplyTo { get; init; }
    public string? ConfigurationSetName { get; init; }
}
