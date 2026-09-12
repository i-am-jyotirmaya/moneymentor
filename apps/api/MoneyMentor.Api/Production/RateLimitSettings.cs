namespace MoneyMentor.Api.Production;

public sealed class RateLimitSettings
{
    public const string SectionName = "RateLimits";

    public int AuthenticatedPerMinute { get; init; } = 120;
    public int AnonymousPerMinute { get; init; } = 60;
    public int SignupsPerHour { get; init; } = 5;
    public int AccessRequestsPerHour { get; init; } = 5;
    public int LoginsPerFiveMinutes { get; init; } = 10;
    public int SessionsPerFiveMinutes { get; init; } = 30;
    public int InvitationsPerHour { get; init; } = 10;
    public int PrivacyOperationsPerHour { get; init; } = 3;
}

public static class RateLimitPolicyNames
{
    public const string Signup = "signup";
    public const string AccessRequest = "access-request";
    public const string Login = "login";
    public const string Session = "session";
    public const string Invitation = "invitation";
    public const string Privacy = "privacy";
}
