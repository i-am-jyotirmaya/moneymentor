namespace MoneyMentor.Infrastructure.Speech;

public sealed class SpeechOptions
{
    public bool Enabled { get; set; }
    public string Provider { get; set; } = "OpenAI";
    public string Endpoint { get; set; } = "https://api.openai.com/v1/audio/transcriptions";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "gpt-transcribe";
    public int TimeoutSeconds { get; set; } = 30;
    public int MaxConcurrent { get; set; } = 4;
    // Bound consent to the currently configured destination and model.
    public string ConsentVersion => "v1:" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{Provider}:{Model}:{Endpoint}")));
    public bool IsValid => Provider is "OpenAI" or "Nemotron"
        && TimeoutSeconds is >= 1 and <= 60 && MaxConcurrent is >= 1 and <= 32
        && !string.IsNullOrWhiteSpace(Model) && Model.Length <= 256
        && Uri.TryCreate(Endpoint, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || Provider == "Nemotron" && uri.Scheme == Uri.UriSchemeHttp)
        && string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment)
        && (Provider != "OpenAI" || uri.Host == "api.openai.com" && !string.IsNullOrWhiteSpace(ApiKey));
}
