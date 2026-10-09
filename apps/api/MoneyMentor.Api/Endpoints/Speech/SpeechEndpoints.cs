using System.Buffers;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Speech;
using MoneyMentor.Infrastructure.Speech;
using MoneyMentor.Api.Production;

namespace MoneyMentor.Api.Endpoints.Speech;

public static class SpeechEndpoints
{
    public static RouteGroupBuilder MapSpeechEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/speech").RequireAuthorization().WithTags("Speech");
        group.MapGet("/capabilities", (ISpeechTranscriber speech, IOptions<SpeechOptions> options) =>
            Results.Ok(new { speech.Status.Enabled, speech.Status.Provider, speech.Status.Model, speech.Status.Disclosure,
                ConsentVersion = options.Value.ConsentVersion, MaxDurationSeconds = 30 }));
        group.MapPost("/transcriptions", TranscribeAsync).RequireRateLimiting(RateLimitPolicyNames.Speech);
        return group;
    }

    internal static async Task<IResult> TranscribeAsync(HttpContext context, ISpeechTranscriber speech,
        IOptions<SpeechOptions> options, CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        if (!speech.Status.Enabled) return Results.Problem(statusCode: 503, title: "Backend transcription is not enabled.");
        if (context.Request.Headers["X-Speech-Upload-Consent"] != options.Value.ConsentVersion)
            return Results.Problem(statusCode: 400, title: "Audio upload consent is required for this provider.");
        var language = context.Request.Headers["X-Speech-Language"].ToString();
        if (language is not ("en-IN" or "en-US" or "hi-IN"))
            return Results.Problem(statusCode: 400, title: "Choose a supported voice language.");
        if (context.Request.ContentType != "audio/wav") return Results.StatusCode(415);
        if (context.Request.ContentLength > SpeechAudio.MaxBytes) return Results.StatusCode(413);
        var bodyLimit = context.Features.Get<IHttpMaxRequestBodySizeFeature>();
        if (bodyLimit is { IsReadOnly: false }) bodyLimit.MaxRequestBodySize = SpeechAudio.MaxBytes;
        // Never use form binding / temporary upload files. Bound even a chunked body in memory.
        var buffer = ArrayPool<byte>.Shared.Rent(SpeechAudio.MaxBytes + 1);
        byte[]? audio = null;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            deadline.CancelAfter(TimeSpan.FromSeconds(10));
            var count = 0;
            while (count <= SpeechAudio.MaxBytes)
            {
                var read = await context.Request.Body.ReadAsync(buffer.AsMemory(count, SpeechAudio.MaxBytes + 1 - count), deadline.Token);
                if (read == 0) break;
                count += read;
            }
            if (count > SpeechAudio.MaxBytes) return Results.StatusCode(413);
            audio = buffer.AsSpan(0, count).ToArray();
            return Results.Ok(await speech.TranscribeAsync(audio, language, cancellationToken));
        }
        catch (SpeechTranscriptionException exception)
        {
            var status = exception.Code switch { "invalid-audio" or "no-speech" => 400, "busy" => 429, "timeout" => 504, "disabled" => 503, _ => 502 };
            return Results.Problem(statusCode: status, title: exception.Code switch
            {
                "invalid-audio" => "Record up to 30 seconds of 16 kHz mono PCM16 audio.",
                "no-speech" => "No clear speech was captured. Try again or keep typing.",
                "busy" => "Transcription is busy. Try again shortly.",
                "timeout" => "Transcription timed out. Try again or keep typing.",
                _ => "Transcription is unavailable. Try again or keep typing."
            });
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        { return Results.Problem(statusCode: 408, title: "Audio upload timed out."); }
        catch (BadHttpRequestException exception) when (exception.StatusCode == 413) { return Results.StatusCode(413); }
        finally
        {
            if (audio is not null) Array.Clear(audio);
            ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
        }
    }
}
