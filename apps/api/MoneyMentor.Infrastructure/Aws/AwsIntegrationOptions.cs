namespace MoneyMentor.Infrastructure.Aws;

public sealed class AwsIntegrationOptions
{
    public const string SectionName = "AWS";

    public bool Enabled { get; set; }
    public string? Region { get; set; }
    public string? Profile { get; set; }
}
