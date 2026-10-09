using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Speech;
using MoneyMentor.Application.Telemetry;

namespace MoneyMentor.Infrastructure.Speech;

// Singleton: the limiter bounds upstream work across all requests on this API instance.
public sealed class HttpSpeechTranscriber : ISpeechTranscriber, IDisposable
{
    private readonly IHttpClientFactory clients;
    private readonly SpeechOptions options;
    private readonly SemaphoreSlim slots;
    public HttpSpeechTranscriber(IHttpClientFactory clients, IOptions<SpeechOptions> options)
    {
        this.clients = clients; this.options = options.Value;
        slots = new SemaphoreSlim(Math.Clamp(this.options.MaxConcurrent, 1, 32));
    }
    public SpeechBackendStatus Status => new(options.Enabled, options.Provider, options.Model,
        options.Provider == "OpenAI"
            ? "Audio is uploaded to Spndrr and OpenAI for transcription. Spndrr does not store recordings. OpenAI retention follows the deployment's provider agreement."
            : "Audio is uploaded to Spndrr and its configured Nemotron server. Spndrr does not store recordings. Inference server retention follows the deployment's policy.");

    public async Task<SpeechTranscript> TranscribeAsync(byte[] wav, string language, CancellationToken cancellationToken)
    {
        if (!options.Enabled) throw new SpeechTranscriptionException("disabled");
        var duration = SpeechAudio.Validate(wav);
        if (!await slots.WaitAsync(0, cancellationToken)) throw new SpeechTranscriptionException("busy");
        var started = Stopwatch.GetTimestamp();
        var outcome = "failure";
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(options.TimeoutSeconds));
            using var form = new MultipartFormDataContent();
            var file = new ByteArrayContent(wav);
            file.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
            form.Add(file, "file", "recording.wav");
            form.Add(new StringContent(options.Model), "model");
            form.Add(new StringContent("json"), "response_format");
            if (options.Provider == "OpenAI" && options.Model == "gpt-transcribe")
            {
                // en-IN commonly includes Hindi code-switching. Do not supply guessed amounts or phrases.
                form.Add(new StringContent(language.StartsWith("hi", StringComparison.Ordinal) ? "hi" : "en"), "languages[]");
                form.Add(new StringContent(language.StartsWith("hi", StringComparison.Ordinal) ? "en" : "hi"), "languages[]");
            }
            else form.Add(new StringContent(options.Provider == "Nemotron" ? language switch { "hi-IN" => "hi-IN", "en-US" => "en-US", _ => "en-GB" } : language.Split('-')[0]), "language");
            using var request = new HttpRequestMessage(HttpMethod.Post, options.Endpoint) { Content = form };
            if (!string.IsNullOrWhiteSpace(options.ApiKey)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.ApiKey);
            // Never propagate provider error bodies: they may contain audio-derived data.
            using var response = await clients.CreateClient("speech").SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (!response.IsSuccessStatusCode) throw new SpeechTranscriptionException("provider-failed");
            await response.Content.LoadIntoBufferAsync(65536, deadline.Token);
            using var json = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync(deadline.Token));
            if (!json.RootElement.TryGetProperty("text", out var value) || value.ValueKind != JsonValueKind.String)
                throw new SpeechTranscriptionException("provider-failed");
            var text = value.GetString()?.Trim() ?? "";
            if (text.Length > 8000) throw new SpeechTranscriptionException("provider-failed");
            outcome = "success";
            MoneyMentorTelemetry.SpeechAudioMinutes.Add(duration / 60000d, new KeyValuePair<string, object?>("provider", options.Provider));
            return new SpeechTranscript(text, options.Provider, options.Model, duration);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new SpeechTranscriptionException("timeout"); }
        catch (HttpRequestException) { throw new SpeechTranscriptionException("provider-failed"); }
        catch (JsonException) { throw new SpeechTranscriptionException("provider-failed"); }
        finally
        {
            slots.Release();
            MoneyMentorTelemetry.SpeechRequests.Add(1, new KeyValuePair<string, object?>("provider", options.Provider), new("outcome", outcome));
            MoneyMentorTelemetry.SpeechDuration.Record(Stopwatch.GetElapsedTime(started).TotalMilliseconds, new KeyValuePair<string, object?>("provider", options.Provider));
        }
    }
    public void Dispose() => slots.Dispose();
}
