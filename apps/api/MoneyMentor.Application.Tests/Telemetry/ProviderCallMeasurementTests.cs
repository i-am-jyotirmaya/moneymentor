using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Text.Json;
using MoneyMentor.Application.Telemetry;
using Xunit;

namespace MoneyMentor.Application.Tests.Telemetry;

public sealed class ProviderCallMeasurementTests
{
    [Fact]
    public void Outbound_attempts_and_reported_tokens_are_counted_without_request_identifiers()
    {
        var samples = new ConcurrentQueue<(string Name, long Value, string? Operation, string? Outcome)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, current) =>
        {
            if (instrument.Meter.Name == MoneyMentorTelemetry.SourceName)
                current.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) =>
        {
            string? operation = null, outcome = null;
            foreach (var tag in tags)
            {
                if (tag.Key == "operation") operation = tag.Value?.ToString();
                if (tag.Key == "outcome") outcome = tag.Value?.ToString();
                Assert.DoesNotContain(tag.Key, new[] { "RequestId", "RunId", "user_id", "source_text" });
            }
            samples.Enqueue((instrument.Name, value, operation, outcome));
        });
        listener.Start();

        using (var attempt = new ProviderCallMeasurement("openai", "narration"))
        {
            using var reply = JsonDocument.Parse("""{"usage":{"input_tokens":42,"output_tokens":9}}""");
            attempt.RecordOpenAiUsage(reply.RootElement);
            attempt.HttpError(System.Net.HttpStatusCode.TooManyRequests);
        }
        using (var attempt = new ProviderCallMeasurement("openai", "goal_plan"))
        {
            using var reply = JsonDocument.Parse("""{"output":[]}""");
            attempt.RecordOpenAiUsage(reply.RootElement);
            attempt.InvalidResponse();
        }

        Assert.Contains(samples, item => item is ("spndrr.llm.requests", 1, "narration", "http_429"));
        Assert.Contains(samples, item => item is ("spndrr.llm.requests", 1, "goal_plan", "invalid_response"));
        Assert.Contains(samples, item => item is ("spndrr.llm.input_tokens", 42, "narration", null));
        Assert.Contains(samples, item => item is ("spndrr.llm.output_tokens", 9, "narration", null));
        Assert.Contains(samples, item => item is ("spndrr.llm.usage_missing", 1, "goal_plan", null));
    }
}
