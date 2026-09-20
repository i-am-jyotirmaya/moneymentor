using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Households;
using MoneyMentor.Infrastructure;
using MoneyMentor.Infrastructure.Email;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class ResendEmailTests
{
    private static readonly TransactionalEmailMessage Email = new(
        Guid.NewGuid(), "recipient@example.com", "Invitation to our household",
        "Join our household", "<p>Join our household</p>");

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("support@example.com")]
    public async Task Sends_text_and_html_with_authentication_and_optional_reply_to(string? replyTo)
    {
        using var handler = new RecordingHandler();
        using var client = CreateClient(handler);
        var result = await CreateSender(client, replyTo: replyTo).SendAsync(Email, CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal("resend-message-id", result.ProviderMessageId);
        Assert.Equal(HttpMethod.Post, handler.Method);
        Assert.Equal("https://api.resend.com/emails", handler.Url);
        Assert.Equal("Bearer test-key", handler.Authorization);
        using var json = JsonDocument.Parse(Assert.IsType<string>(handler.Body));
        var body = json.RootElement;
        Assert.Equal("Spndrr <hello@example.com>", body.GetProperty("from").GetString());
        Assert.Equal(Email.To, Assert.Single(body.GetProperty("to").EnumerateArray()).GetString());
        Assert.Equal(Email.Subject, body.GetProperty("subject").GetString());
        Assert.Equal(Email.TextBody, body.GetProperty("text").GetString());
        Assert.Equal(Email.HtmlBody, body.GetProperty("html").GetString());
        if (string.IsNullOrEmpty(replyTo)) Assert.False(body.TryGetProperty("reply_to", out _));
        else Assert.Equal(replyTo, Assert.Single(body.GetProperty("reply_to").EnumerateArray()).GetString());
    }

    [Fact]
    public async Task Retries_keep_the_delivery_key_and_new_deliveries_get_a_new_key()
    {
        using var handler = new RecordingHandler();
        using var client = CreateClient(handler);
        var sender = CreateSender(client);
        await sender.SendAsync(Email, CancellationToken.None);
        var first = handler.IdempotencyKey;
        await sender.SendAsync(Email, CancellationToken.None);
        Assert.Equal($"transactional-email/{Email.DeliveryId:N}", first);
        Assert.Equal(first, handler.IdempotencyKey);
        await sender.SendAsync(Email with { DeliveryId = Guid.NewGuid() }, CancellationToken.None);
        Assert.NotEqual(first, handler.IdempotencyKey);
    }

    [Theory]
    [InlineData("", "hello@example.com")]
    [InlineData("test-key", "")]
    public async Task Missing_configuration_fails_without_a_network_request(string key, string from)
    {
        using var handler = new RecordingHandler();
        using var client = CreateClient(handler);
        var result = await CreateSender(client, key, from).SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        Assert.Contains("requires", result.Error);
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData(400)]
    [InlineData(401)]
    [InlineData(403)]
    [InlineData(429)]
    [InlineData(500)]
    public async Task Provider_errors_do_not_expose_response_content(int status)
    {
        using var handler = new RecordingHandler
        {
            Send = _ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)
            { Content = new StringContent("private recipient@example.com token details") })
        };
        using var client = CreateClient(handler);
        var result = await CreateSender(client).SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        Assert.Equal($"Resend rejected the message with HTTP {status}.", result.Error);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"id\":\"\"}")]
    [InlineData("null")]
    [InlineData("not-json")]
    public async Task Invalid_success_response_is_not_reported_as_sent(string body)
    {
        using var handler = new RecordingHandler
        {
            Send = _ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            { Content = new StringContent(body) })
        };
        using var client = CreateClient(handler);
        var result = await CreateSender(client).SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        Assert.Null(result.ProviderMessageId);
    }

    [Fact]
    public async Task Transport_failure_is_sanitized_and_a_later_attempt_can_recover()
    {
        var attempts = 0;
        using var handler = new RecordingHandler
        {
            Send = _ => ++attempts == 1
                ? throw new HttpRequestException("private details")
                : Task.FromResult(Success())
        };
        using var client = CreateClient(handler);
        var sender = CreateSender(client);
        var first = await sender.SendAsync(Email, CancellationToken.None);
        Assert.Equal("Resend could not be reached.", first.Error);
        Assert.True((await sender.SendAsync(Email, CancellationToken.None)).Succeeded);
    }

    [Fact]
    public async Task Timeout_reports_uncertain_delivery()
    {
        using var handler = new RecordingHandler { Send = _ => throw new TaskCanceledException() };
        using var client = CreateClient(handler);
        var result = await CreateSender(client).SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        Assert.Contains("delivery may have occurred", result.Error);
    }

    [Fact]
    public async Task Caller_cancellation_reaches_the_transport_and_propagates()
    {
        using var cancellation = new CancellationTokenSource();
        using var handler = new RecordingHandler
        {
            Send = token =>
            {
                cancellation.Cancel();
                token.ThrowIfCancellationRequested();
                return Task.FromResult(Success());
            }
        };
        using var client = CreateClient(handler);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateSender(client).SendAsync(Email, cancellation.Token));
    }

    [Theory]
    [InlineData("", "hello@example.com", "Resend:ApiKey")]
    [InlineData("test-key", "", "Resend:FromAddress")]
    public async Task Dispatcher_configuration_is_validated_before_workers_start(string key, string from, string error)
    {
        using var host = CreateHost(key, from, dispatcher: true);
        var exception = await Assert.ThrowsAsync<OptionsValidationException>(() => host.StartAsync());
        Assert.Contains(error, exception.Message);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Direct_approval_sender_works_without_aws_and_independently_of_dispatcher(bool dispatcher)
    {
        using var handler = new RecordingHandler();
        using var host = CreateHost("test-key", "hello@example.com", dispatcher, handler);
        await host.StartAsync();
        var sender = host.Services.GetRequiredService<ITransactionalEmailSender>();
        Assert.IsType<ResendTransactionalEmailSender>(sender);
        Assert.True((await sender.SendAsync(Email, CancellationToken.None)).Succeeded);
        await host.StopAsync();
    }

    [Fact]
    public async Task Disabled_dispatcher_allows_unconfigured_startup_but_direct_send_fails()
    {
        using var host = CreateHost("", "", dispatcher: false);
        await host.StartAsync();
        var result = await host.Services.GetRequiredService<ITransactionalEmailSender>()
            .SendAsync(Email, CancellationToken.None);
        Assert.False(result.Succeeded);
        await host.StopAsync();
    }

    private static IHost CreateHost(string key, string from, bool dispatcher, HttpMessageHandler? handler = null)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { DisableDefaults = true });
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:MoneyMentorDb"] = "Host=unused",
            ["AWS:Enabled"] = "false",
            ["Resend:ApiKey"] = key,
            ["Resend:FromAddress"] = from,
            ["Resend:DispatcherEnabled"] = dispatcher.ToString()
        });
        builder.Services.AddInfrastructure(builder.Configuration);
        if (handler is not null)
            builder.Services.AddHttpClient<ITransactionalEmailSender, ResendTransactionalEmailSender>()
                .ConfigurePrimaryHttpMessageHandler(() => handler);
        builder.Services.RemoveAll<IHostedService>(); // No database workers in these configuration tests.
        return builder.Build();
    }

    private static HttpClient CreateClient(HttpMessageHandler handler) =>
        new(handler) { BaseAddress = new Uri("https://api.resend.com/") };

    private static ResendTransactionalEmailSender CreateSender(
        HttpClient client, string key = "test-key", string from = "Spndrr <hello@example.com>", string? replyTo = null) =>
        new(client, Options.Create(new ResendOptions { ApiKey = key, FromAddress = from, ReplyTo = replyTo }));

    private static HttpResponseMessage Success() => new(HttpStatusCode.OK)
    { Content = new StringContent("{\"id\":\"resend-message-id\"}") };

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public HttpMethod? Method { get; private set; }
        public string? Url { get; private set; }
        public string? Authorization { get; private set; }
        public string? IdempotencyKey { get; private set; }
        public string? Body { get; private set; }
        public Func<CancellationToken, Task<HttpResponseMessage>> Send { get; init; } = _ => Task.FromResult(Success());

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Method = request.Method;
            Url = request.RequestUri?.ToString();
            Authorization = request.Headers.Authorization?.ToString();
            IdempotencyKey = Assert.Single(request.Headers.GetValues("Idempotency-Key"));
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return await Send(cancellationToken);
        }
    }
}
