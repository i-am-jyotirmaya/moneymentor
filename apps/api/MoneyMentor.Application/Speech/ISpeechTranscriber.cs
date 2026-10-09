namespace MoneyMentor.Application.Speech;

public sealed record SpeechBackendStatus(bool Enabled, string Provider, string Model, string Disclosure);
public sealed record SpeechTranscript(string Text, string Provider, string Model, int AudioDurationMs);
public interface ISpeechTranscriber
{
    SpeechBackendStatus Status { get; }
    Task<SpeechTranscript> TranscribeAsync(byte[] wav, string language, CancellationToken cancellationToken);
}
public sealed class SpeechTranscriptionException(string code) : Exception(code)
{
    public string Code { get; } = code;
}
