using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MoneyMentor.Infrastructure.Aws;

public static class DependencyInjection
{
    public static IServiceCollection AddAwsIntegration(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var section = configuration.GetSection(AwsIntegrationOptions.SectionName);
        services.AddOptions<AwsIntegrationOptions>()
            .Bind(section)
            .Validate(options => !options.Enabled || !string.IsNullOrWhiteSpace(options.Region),
                "AWS:Region is required when AWS:Enabled is true.")
            .ValidateOnStart();

        if (section.GetValue<bool>(nameof(AwsIntegrationOptions.Enabled)))
        {
            // Only binds configuration. The SDK resolves and refreshes credentials when
            // a future service client needs them, using a local profile or the EC2 role.
            services.AddDefaultAWSOptions(configuration.GetAWSOptions(AwsIntegrationOptions.SectionName));
        }

        return services;
    }
}
