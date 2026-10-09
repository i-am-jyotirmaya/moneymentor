using System.Buffers.Binary;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MoneyMentor.Api.Endpoints.Speech;
using MoneyMentor.Api.Production;
using MoneyMentor.Application.Speech;
using MoneyMentor.Infrastructure.Speech;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class SpeechTests
{
    [Fact]
    public async Task Speech_endpoint_requires_auth_and_separate_provider_consent()
    {
        var speech = new FakeTranscriber();
        await using var app = await CreateApp(speech);
        using var client = app.GetTestClient();
        using var anonymous = await client.GetAsync("/api/speech/capabilities");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        using var capabilities = Request(HttpMethod.Get, "/api/speech/capabilities");
        using var available = await client.SendAsync(capabilities);
        Assert.Equal(HttpStatusCode.OK, available.StatusCode);
        using var missingConsent = Upload(Wav(), consent: "allow-system");
        using var denied = await client.SendAsync(missingConsent);
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode);
        Assert.Equal(0, speech.Calls);
        using var request = Upload(Wav());
        using var result = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.Contains("bought coffee for 30 rupees", await result.Content.ReadAsStringAsync());
        Assert.Equal("no-store", result.Headers.CacheControl?.ToString());
        Assert.Equal(1, speech.Calls);
        Assert.True(speech.LastAudio!.All(value => value == 0)); // request memory wiped after return
    }

    [Fact]
    public async Task Speech_endpoint_rejects_bad_format_language_size_silence_and_disabled_backend()
    {
        var speech = new FakeTranscriber();
        await using var app = await CreateApp(speech);
        using var client = app.GetTestClient();
        foreach (var (audio, language, contentType, status) in new[]
        {
            (new byte[SpeechAudio.MaxBytes + 1], "en-IN", "audio/wav", HttpStatusCode.RequestEntityTooLarge),
            (Wav(), "xx", "audio/wav", HttpStatusCode.BadRequest),
            (Wav(), "en-IN", "audio/webm", HttpStatusCode.UnsupportedMediaType),
            (new byte[60], "en-IN", "audio/wav", HttpStatusCode.BadRequest),
            (Wav(silent: true), "en-IN", "audio/wav", HttpStatusCode.BadRequest),
        })
        {
            using var request = Upload(audio, language: language, contentType: contentType);
            using var result = await client.SendAsync(request);
            Assert.Equal(status, result.StatusCode);
        }
        speech.Enabled = false;
        using var disabledRequest = Upload(Wav());
        using var disabled = await client.SendAsync(disabledRequest);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, disabled.StatusCode);
    }

    [Fact]
    public async Task Speech_rate_limit_is_per_authenticated_caller()
    {
        await using var app = await CreateApp(new FakeTranscriber(), permits: 1);
        using var client = app.GetTestClient();
        using var first = Upload(Wav()); using var second = Upload(Wav());
        using var firstResult = await client.SendAsync(first); using var secondResult = await client.SendAsync(second);
        Assert.Equal(HttpStatusCode.OK, firstResult.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, secondResult.StatusCode);
        using var other = Upload(Wav()); other.Headers.Remove("X-Test-Auth"); other.Headers.Add("X-Test-Auth", "other-user");
        using var otherResult = await client.SendAsync(other);
        Assert.Equal(HttpStatusCode.OK, otherResult.StatusCode);
    }

    [Theory]
    [InlineData("OpenAI", "gpt-transcribe", "languages[]", "en")]
    [InlineData("Nemotron", "nemotron-3.5", "language", "en-GB")]
    public async Task Provider_sends_valid_WAV_and_language_fields_without_guessing_money(string provider, string model, string languageField, string languageValue)
    {
        var handler = new RecordingHandler();
        var options = new SpeechOptions { Enabled = true, Provider = provider, Model = model, ApiKey = "test-key" };
        using var transcriber = new HttpSpeechTranscriber(new ClientFactory(handler), Options.Create(options));
        var transcript = await transcriber.TranscribeAsync(Wav(), "en-IN", CancellationToken.None);
        Assert.Equal("bought coffee for 30 rupees", transcript.Text);
        Assert.Equal(1000, transcript.AudioDurationMs);
        Assert.Contains(languageValue, handler.Fields[languageField]);
        Assert.DoesNotContain("bought coffee", handler.Body);
        Assert.DoesNotContain("prompt", handler.Body);
        Assert.Equal("Bearer test-key", handler.Authorization);
    }

    [Fact]
    public async Task Provider_bounds_concurrency_and_cancellation_releases_slot()
    {
        var handler = new RecordingHandler { Wait = true };
        using var transcriber = new HttpSpeechTranscriber(new ClientFactory(handler), Options.Create(new SpeechOptions { Enabled = true, MaxConcurrent = 1, ApiKey = "test" }));
        using var cancellation = new CancellationTokenSource();
        var first = transcriber.TranscribeAsync(Wav(), "en-IN", cancellation.Token);
        await handler.Started.Task;
        var busy = await Assert.ThrowsAsync<SpeechTranscriptionException>(() => transcriber.TranscribeAsync(Wav(), "en-IN", CancellationToken.None));
        Assert.Equal("busy", busy.Code);
        cancellation.Cancel(); await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        handler.Wait = false;
        Assert.Equal("bought coffee for 30 rupees", (await transcriber.TranscribeAsync(Wav(), "en-IN", CancellationToken.None)).Text);
    }

    [Fact]
    public async Task Provider_timeout_returns_safe_error_and_releases_slot()
    {
        var handler = new RecordingHandler { Wait = true };
        using var transcriber = new HttpSpeechTranscriber(new ClientFactory(handler), Options.Create(new SpeechOptions { Enabled = true, ApiKey = "test", MaxConcurrent = 1, TimeoutSeconds = 1 }));
        var error = await Assert.ThrowsAsync<SpeechTranscriptionException>(() => transcriber.TranscribeAsync(Wav(), "hi-IN", CancellationToken.None));
        Assert.Equal("timeout", error.Code);
        handler.Wait = false;
        Assert.Equal("bought coffee for 30 rupees", (await transcriber.TranscribeAsync(Wav(), "hi-IN", CancellationToken.None)).Text);
    }

    [Theory]
    [InlineData("invalid-json", 200)]
    [InlineData("{\"unexpected\":\"private provider details\"}", 200)]
    [InlineData("private provider details", 500)]
    public async Task Provider_failures_never_expose_upstream_body(string body, int status)
    {
        using var transcriber = new HttpSpeechTranscriber(new ClientFactory(new RecordingHandler { Response = body, Status = status }), Options.Create(new SpeechOptions { Enabled = true, ApiKey = "test" }));
        var error = await Assert.ThrowsAsync<SpeechTranscriptionException>(() => transcriber.TranscribeAsync(Wav(), "en-US", CancellationToken.None));
        Assert.Equal("provider-failed", error.Code); Assert.DoesNotContain("private", error.Message);
    }

    [Fact]
    public void Audio_duration_and_metadata_are_validated_from_samples()
    {
        Assert.Equal(1000, SpeechAudio.Validate(Wav()));
        var broken = Wav(); BinaryPrimitives.WriteUInt32LittleEndian(broken.AsSpan(24, 4), 48000);
        Assert.Throws<SpeechTranscriptionException>(() => SpeechAudio.Validate(broken));
        Assert.Throws<SpeechTranscriptionException>(() => SpeechAudio.Validate(Wav(silent: true)));
    }

    private static async Task<WebApplication> CreateApp(FakeTranscriber transcriber, int permits = 20)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthentication("test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddSingleton<ISpeechTranscriber>(transcriber);
        builder.Services.Configure<SpeechOptions>(_ => { });
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.AddPolicy(RateLimitPolicyNames.Speech, context => System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
                context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous",
                _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        var app = builder.Build();
        app.UseAuthentication(); app.UseRateLimiter(); app.UseAuthorization(); app.MapSpeechEndpoints();
        await app.StartAsync(); return app;
    }
    private static HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path); request.Headers.Add("X-Test-Auth", "test-user"); return request;
    }
    private static HttpRequestMessage Upload(byte[] wav, string? consent = null, string language = "en-IN", string contentType = "audio/wav")
    {
        var request = Request(HttpMethod.Post, "/api/speech/transcriptions");
        request.Headers.Add("X-Speech-Upload-Consent", consent ?? new SpeechOptions().ConsentVersion);
        request.Headers.Add("X-Speech-Language", language);
        request.Content = new ByteArrayContent(wav); request.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType); return request;
    }
    private static byte[] Wav(bool silent = false)
    {
        var wav = new byte[32044];
        void Text(int offset, string value) => Encoding.ASCII.GetBytes(value).CopyTo(wav, offset);
        void U16(int offset, ushort value) => BinaryPrimitives.WriteUInt16LittleEndian(wav.AsSpan(offset, 2), value);
        void U32(int offset, uint value) => BinaryPrimitives.WriteUInt32LittleEndian(wav.AsSpan(offset, 4), value);
        Text(0, "RIFF"); U32(4, 32036); Text(8, "WAVEfmt "); U32(16, 16); U16(20, 1); U16(22, 1);
        U32(24, 16000); U32(28, 32000); U16(32, 2); U16(34, 16); Text(36, "data"); U32(40, 32000);
        if (!silent) for (var offset = 44; offset < wav.Length; offset += 2) U16(offset, 1000);
        return wav;
    }
    private sealed class FakeTranscriber : ISpeechTranscriber
    {
        public bool Enabled { get; set; } = true;
        public int Calls { get; private set; }
        public byte[]? LastAudio { get; private set; }
        public SpeechBackendStatus Status => new(Enabled, "test", "test", "test disclosure");
        public Task<SpeechTranscript> TranscribeAsync(byte[] wav, string language, CancellationToken cancellationToken)
        {
            var duration = SpeechAudio.Validate(wav); Calls++; LastAudio = wav;
            return Task.FromResult(new SpeechTranscript("bought coffee for 30 rupees", "test", "test", duration));
        }
    }
    private sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var user = Request.Headers["X-Test-Auth"].ToString();
            if (string.IsNullOrEmpty(user)) return Task.FromResult(AuthenticateResult.NoResult());
            var principal = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user)], "test"));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, "test")));
        }
    }
    private sealed class ClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }
    private sealed class RecordingHandler : HttpMessageHandler
    {
        public string Body { get; private set; } = "";
        public Dictionary<string, List<string>> Fields { get; } = new();
        public string? Authorization { get; private set; }
        public bool Wait { get; set; }
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public string Response { get; init; } = "{\"text\":\"bought coffee for 30 rupees\"}";
        public int Status { get; init; } = 200;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (request.Content is MultipartFormDataContent parts)
                foreach (var part in parts)
                {
                    var name = part.Headers.ContentDisposition!.Name!.Trim('"');
                    if (name == "file") continue;
                    if (!Fields.TryGetValue(name, out var values)) Fields[name] = values = [];
                    values.Add(await part.ReadAsStringAsync(cancellationToken));
                }
            Body = await request.Content!.ReadAsStringAsync(cancellationToken); Authorization = request.Headers.Authorization?.ToString();
            Started.TrySetResult();
            if (Wait) await Task.Delay(Timeout.Infinite, cancellationToken);
            return new HttpResponseMessage((HttpStatusCode)Status) { Content = new StringContent(Response) };
        }
    }
}
