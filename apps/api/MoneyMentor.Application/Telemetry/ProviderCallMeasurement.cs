using System.Diagnostics;
using System.Net;
using System.Text.Json;

namespace MoneyMentor.Application.Telemetry;

// One instance per outbound HTTP attempt. No request content or provider responses become labels.
public sealed class ProviderCallMeasurement : IDisposable
{
    private readonly string provider;
    private readonly string operation;
    private readonly long started = Stopwatch.GetTimestamp();
    private string outcome = "error";

    public ProviderCallMeasurement(string provider, string operation)
    {
        this.provider = provider;
        this.operation = operation;
    }

    public void Succeeded() => outcome = "success";
    public void TimedOut() => outcome = "timeout";
    public void Cancelled() => outcome = "cancelled";
    public void InvalidResponse() => outcome = "invalid_response";
    public void NetworkError() => outcome = "network_error";

    public void HttpError(HttpStatusCode status) => outcome = (int)status switch
    {
        429 => "http_429",
        >= 500 => "http_5xx",
        >= 400 => "http_4xx",
        _ => "http_error"
    };

    public void RecordOpenAiUsage(JsonElement root)
    {
        if (provider != "openai") return;
        var tags = new KeyValuePair<string, object?>("operation", operation);
        if (root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("usage", out var usage)
            || usage.ValueKind != JsonValueKind.Object
            || !TryReadTokens(usage, "input_tokens", out var input)
            || !TryReadTokens(usage, "output_tokens", out var output))
        {
            MoneyMentorTelemetry.LlmUsageMissing.Add(1, tags);
            return;
        }

        MoneyMentorTelemetry.LlmInputTokens.Add(input, tags);
        MoneyMentorTelemetry.LlmOutputTokens.Add(output, tags);
    }

    private static bool TryReadTokens(JsonElement usage, string name, out long value)
    {
        value = 0;
        return usage.TryGetProperty(name, out var token)
            && token.ValueKind == JsonValueKind.Number
            && token.TryGetInt64(out value) && value >= 0;
    }

    public void Dispose()
    {
        var tags = new KeyValuePair<string, object?>[]
        {
            new("operation", operation), new("outcome", outcome)
        };
        var elapsed = Stopwatch.GetElapsedTime(started).TotalMilliseconds;
        if (provider == "jev")
        {
            MoneyMentorTelemetry.JevRequests.Add(1, tags);
            MoneyMentorTelemetry.JevRequestDuration.Record(elapsed, tags);
        }
        else
        {
            MoneyMentorTelemetry.LlmRequests.Add(1, tags);
            MoneyMentorTelemetry.LlmRequestDuration.Record(elapsed, tags);
        }
    }
}
