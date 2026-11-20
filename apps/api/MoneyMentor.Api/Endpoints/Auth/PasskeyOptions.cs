using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MoneyMentor.Infrastructure.Auth;
using MoneyMentor.Infrastructure.Identity;

namespace MoneyMentor.Api.Endpoints.Auth;

internal sealed partial class PasskeyOptions
{
    public string RelyingPartyId { get; init; } = "mvp.spndrr.com";
    public string[] AndroidOrigins { get; init; } = [];

    public static void Configure(IServiceCollection services, IConfiguration configuration)
    {
        var settings = configuration.GetSection("Passkeys").Get<PasskeyOptions>() ?? new();
        var rpId = settings.RelyingPartyId.ToLowerInvariant();
        if (Uri.CheckHostName(rpId) != UriHostNameType.Dns || !rpId.Contains('.') || rpId.EndsWith('.'))
        {
            throw new InvalidOperationException("Passkeys:RelyingPartyId must be a DNS hostname.");
        }
        var androidOrigins = configuration["Passkeys:AndroidOrigins"]
            ?.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries) ?? settings.AndroidOrigins;
        if (androidOrigins.Any(origin => !AndroidOriginPattern().IsMatch(origin)))
        {
            throw new InvalidOperationException("Passkeys:AndroidOrigins must contain Android certificate origins.");
        }

        var origins = new HashSet<string>(androidOrigins, StringComparer.Ordinal) { $"https://{rpId}" };
        services.Configure<IdentityPasskeyOptions>(options =>
        {
            options.ServerDomain = rpId;
            options.AuthenticatorTimeout = PasskeyChallengeStore.Lifetime;
            options.ResidentKeyRequirement = "required";
            options.UserVerificationRequirement = "required";
            options.AttestationConveyancePreference = "none";
            options.AuthenticatorAttachment = "platform";
            options.ValidateOrigin = context => ValueTask.FromResult(
                !context.CrossOrigin && context.TopOrigin is null && origins.Contains(context.Origin));
        });
        services.TryAddScoped<IPasskeyHandler<ApplicationUser>, PasskeyHandler<ApplicationUser>>();
        services.AddScoped<PasskeyChallengeStore>();
        services.AddScoped<PostgresPasskeyStore>();
    }

    [GeneratedRegex(@"\Aandroid:apk-key-hash:[A-Za-z0-9_-]{43}\z")]
    private static partial Regex AndroidOriginPattern();
}
