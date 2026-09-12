namespace MoneyMentor.Application.Registration;

public sealed class RegistrationOptions
{
    public const string SectionName = "Registration";
    public string Mode { get; init; } = "RequestOnly";
    public bool IsOpen => Mode == "Open";
}
