using Amazon.Extensions.NETCore.Setup;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MoneyMentor.Infrastructure.Aws;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class AwsIntegrationTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public async Task Disabled_or_absent_configuration_starts_without_aws_options(string? enabled)
    {
        using var host = CreateHost(new Dictionary<string, string?> { ["AWS:Enabled"] = enabled });

        await host.StartAsync();

        Assert.False(host.Services.GetRequiredService<IOptions<AwsIntegrationOptions>>().Value.Enabled);
        Assert.Null(host.Services.GetService<AWSOptions>());
        await host.StopAsync();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Enabled_configuration_requires_a_region_at_startup(string? region)
    {
        using var host = CreateHost(new Dictionary<string, string?>
        {
            ["AWS:Enabled"] = "true",
            ["AWS:Region"] = region
        });

        var exception = await Assert.ThrowsAsync<OptionsValidationException>(() => host.StartAsync());

        Assert.Contains("AWS:Region is required", exception.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("moneymentor-intentionally-nonexistent-test-profile")]
    public async Task Enabled_configuration_starts_without_resolving_credentials(string? profile)
    {
        using var host = CreateHost(new Dictionary<string, string?>
        {
            ["AWS:Enabled"] = "true",
            ["AWS:Region"] = "ap-south-1",
            ["AWS:Profile"] = profile
        });

        await host.StartAsync();

        var options = host.Services.GetRequiredService<AWSOptions>();
        Assert.Equal("ap-south-1", options.Region.SystemName);
        Assert.Equal(profile, options.Profile);
        Assert.Null(options.Credentials);
        await host.StopAsync();
    }

    private static IHost CreateHost(Dictionary<string, string?> settings)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { DisableDefaults = true });
        builder.Configuration.AddInMemoryCollection(settings);
        builder.Services.AddAwsIntegration(builder.Configuration);
        return builder.Build();
    }
}
