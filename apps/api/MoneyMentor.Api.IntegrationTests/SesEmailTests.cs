using System.Net;
using Amazon;
using Amazon.Runtime;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Households;
using MoneyMentor.Infrastructure;
using MoneyMentor.Infrastructure.Aws;
using MoneyMentor.Infrastructure.Email;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class SesEmailTests
{
    private static readonly TransactionalEmailMessage Email = new(
        Guid.NewGuid(), "recipient@example.com", "Invitation to our household",
        "Join our household", "<p>Join our household</p>");

    [Theory]
    [InlineData(null, null)]
    [InlineData("support@example.com", "transactional")]
    public async Task Sends_utf8_text_and_html_and_returns_ses_message_id(string? replyTo, string? configurationSet)
    {
        using var client = new RecordingSesClient();
        var sender = CreateSender(() => client, new SesOptions
        {
            FromAddress = "MoneyMentor <hello@example.com>",
            ReplyTo = replyTo,
            ConfigurationSetName = configurationSet
        });

        var result = await sender.SendAsync(Email, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("ses-message-id", result.ProviderMessageId);
        var request = Assert.IsType<SendEmailRequest>(client.Request);
        Assert.Equal("MoneyMentor <hello@example.com>", request.FromEmailAddress);
        Assert.Equal(Email.To, Assert.Single(request.Destination.ToAddresses));
        Assert.Equal(Email.Subject, request.Content.Simple.Subject.Data);
        Assert.Equal(Email.TextBody, request.Content.Simple.Body.Text.Data);
        Assert.Equal(Email.HtmlBody, request.Content.Simple.Body.Html.Data);
        Assert.Equal("UTF-8", request.Content.Simple.Subject.Charset);
        Assert.Equal("UTF-8", request.Content.Simple.Body.Text.Charset);
        Assert.Equal("UTF-8", request.Content.Simple.Body.Html.Charset);
        Assert.Equal(configurationSet, request.ConfigurationSetName);
        if (replyTo is null) Assert.Null(request.ReplyToAddresses);
        else Assert.Equal(replyTo, Assert.Single(request.ReplyToAddresses));
        var tag = Assert.Single(request.EmailTags);
        Assert.Equal("delivery-id", tag.Name);
        Assert.Equal(Email.DeliveryId.ToString("N"), tag.Value);
    }

    [Theory]
    [InlineData(false, "ap-south-1", "hello@example.com")]
    [InlineData(true, "", "hello@example.com")]
    [InlineData(true, "ap-south-1", "")]
    public async Task Missing_configuration_fails_without_constructing_an_aws_client(bool enabled, string region, string from)
    {
        var sender = CreateSender(
            () => throw new InvalidOperationException("AWS client must not be resolved"),
            new SesOptions { FromAddress = from }, new AwsIntegrationOptions { Enabled = enabled, Region = region });

        var result = await sender.SendAsync(Email, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Contains("requires", result.Error);
    }

    [Theory]
    [InlineData(403)]
    [InlineData(429)]
    [InlineData(400)]
    public async Task Provider_failures_do_not_leak_email_or_exception_details(int status)
    {
        using var client = new RecordingSesClient
        {
            Send = (_, _) => throw new AmazonSimpleEmailServiceV2Exception("private recipient@example.com details")
            {
                StatusCode = (HttpStatusCode)status
            }
        };

        var result = await CreateSender(() => client).SendAsync(Email, CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Equal($"SES rejected the message with HTTP {status}.", result.Error);
    }

    [Fact]
    public async Task A_response_without_a_message_id_is_not_reported_as_sent()
    {
        using var client = new RecordingSesClient { Send = (_, _) => Task.FromResult(new SendEmailResponse()) };
        var result = await CreateSender(() => client).SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        Assert.Null(result.ProviderMessageId);
    }

    [Fact]
    public async Task Credential_failure_is_sanitized_and_a_later_attempt_can_recover()
    {
        using var client = new RecordingSesClient();
        var attempts = 0;
        var sender = CreateSender(() => ++attempts == 1
            ? throw new AmazonClientException("private credential configuration") : client);

        var first = await sender.SendAsync(Email, CancellationToken.None);
        var second = await sender.SendAsync(Email, CancellationToken.None);

        Assert.False(first.Succeeded);
        Assert.DoesNotContain("private", first.Error);
        Assert.True(second.Succeeded);
    }

    [Fact]
    public async Task Transport_timeout_reports_uncertain_delivery()
    {
        using var client = new RecordingSesClient { Send = (_, _) => throw new TaskCanceledException() };
        var result = await CreateSender(() => client).SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        Assert.Contains("delivery may have occurred", result.Error);
    }

    [Fact]
    public async Task Caller_cancellation_is_propagated_to_the_sdk_and_the_caller()
    {
        using var cancellation = new CancellationTokenSource();
        using var client = new RecordingSesClient
        {
            Send = (_, token) =>
            {
                cancellation.Cancel();
                token.ThrowIfCancellationRequested();
                return Task.FromResult(new SendEmailResponse());
            }
        };

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateSender(() => client).SendAsync(Email, cancellation.Token));
    }

    [Theory]
    [InlineData("false", "hello@example.com", "AWS:Enabled")]
    [InlineData("true", "", "SES:FromAddress")]
    public async Task Dispatcher_configuration_is_validated_before_workers_start(string enabled, string from, string error)
    {
        using var host = CreateHost(enabled, from, dispatcher: true);
        var exception = await Assert.ThrowsAsync<OptionsValidationException>(() => host.StartAsync());
        Assert.Contains(error, exception.Message);
    }

    [Theory]
    [InlineData("false")]
    [InlineData("true")]
    public async Task Resolving_the_email_sender_at_startup_does_not_resolve_aws_credentials(string enabled)
    {
        using var host = CreateHost(enabled, "hello@example.com", dispatcher: false);
        await host.StartAsync();
        Assert.IsType<SesTransactionalEmailSender>(host.Services.GetRequiredService<ITransactionalEmailSender>());
        await host.StopAsync();
    }

    private static IHost CreateHost(string enabled, string from, bool dispatcher)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { DisableDefaults = true });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:MoneyMentorDb"] = "Host=unused",
            ["AWS:Enabled"] = enabled,
            ["AWS:Region"] = "ap-south-1",
            ["AWS:Profile"] = "moneymentor-intentionally-nonexistent-test-profile",
            ["SES:FromAddress"] = from,
            ["SES:DispatcherEnabled"] = dispatcher.ToString()
        });
        builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.RemoveAll<IHostedService>(); // No database workers in these configuration tests.
        return builder.Build();
    }

    private static SesTransactionalEmailSender CreateSender(
        Func<IAmazonSimpleEmailServiceV2> factory, SesOptions? options = null, AwsIntegrationOptions? awsOptions = null) =>
        new(factory,
            Options.Create(options ?? new SesOptions { FromAddress = "hello@example.com" }),
            Options.Create(awsOptions ?? new AwsIntegrationOptions { Enabled = true, Region = "ap-south-1" }));

    private sealed class RecordingSesClient() : AmazonSimpleEmailServiceV2Client(
        new AnonymousAWSCredentials(), new AmazonSimpleEmailServiceV2Config { RegionEndpoint = RegionEndpoint.APSouth1 })
    {
        public SendEmailRequest? Request { get; private set; }
        public Func<SendEmailRequest, CancellationToken, Task<SendEmailResponse>> Send { get; init; } =
            (_, _) => Task.FromResult(new SendEmailResponse { MessageId = "ses-message-id" });

        public override Task<SendEmailResponse> SendEmailAsync(SendEmailRequest request, CancellationToken cancellationToken = default)
        {
            Request = request;
            return Send(request, cancellationToken);
        }
    }
}
