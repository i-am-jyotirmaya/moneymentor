using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Jev;
using MoneyMentor.Application.Telemetry;

namespace MoneyMentor.Infrastructure.Jev;

public sealed class JevOptions
{
    public const string SectionName = "Jev";

    public string? ApiKey { get; set; }
    public string Model { get; set; } = "jev-latest";
    public int TimeoutSeconds { get; set; } = 5;
}

public sealed class JevClient(HttpClient httpClient, IOptions<JevOptions> options) : IJevClient
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Value.ApiKey);

    public async Task<JevDecision> DecideAsync(
        object state,
        IReadOnlyDictionary<string, JevQuestion> questions,
        CancellationToken cancellationToken, string operation = "categorization")
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("Jev:ApiKey is not configured.");
        }

        if (questions.Count == 0)
        {
            throw new ArgumentException("At least one question is required.", nameof(questions));
        }

        if (operation is not ("categorization" or "judgment_decision" or "memory_admission"))
            throw new ArgumentOutOfRangeException(nameof(operation));

        using var message = new HttpRequestMessage(HttpMethod.Post, "v1/systemone");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        message.Content = JsonContent.Create(new { model = options.Value.Model, state, questions });

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.Value.TimeoutSeconds, 1, 30)));
        using var measurement = new ProviderCallMeasurement("jev", operation);
        try
        {
            using var response = await httpClient.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                measurement.HttpError(response.StatusCode);
                response.EnsureSuccessStatusCode();
            }
            using var body = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(timeout.Token), cancellationToken: timeout.Token);
            if (!body.RootElement.TryGetProperty("answers", out var answers)
                || answers.ValueKind != JsonValueKind.Object)
            {
                throw new JsonException("Jev response is missing answers.");
            }

            var model = body.RootElement.TryGetProperty("model", out var responseModel)
                && responseModel.ValueKind == JsonValueKind.String
                ? responseModel.GetString() : null;
            long? inputTokens = null, outputTokens = null;
            if (body.RootElement.TryGetProperty("usage", out var usage))
            {
                if (usage.ValueKind != JsonValueKind.Object)
                    throw new JsonException("Jev response has invalid usage.");
                inputTokens = ReadTokenCount(usage, "input_tokens");
                outputTokens = ReadTokenCount(usage, "output_tokens");
            }
            measurement.Succeeded();
            return new JevDecision(answers, model, inputTokens, outputTokens);
        }
        catch (OperationCanceledException)
        {
            if (cancellationToken.IsCancellationRequested) measurement.Cancelled();
            else measurement.TimedOut();
            throw;
        }
        catch (JsonException)
        {
            measurement.InvalidResponse();
            throw;
        }
        catch (HttpRequestException exception)
        {
            // EnsureSuccessStatusCode has already recorded its HTTP outcome.
            if (exception.StatusCode is null) measurement.NetworkError();
            throw;
        }
    }

    private static long? ReadTokenCount(JsonElement usage, string name)
    {
        if (!usage.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out var count) || count < 0)
            throw new JsonException($"Jev response has invalid {name}.");
        return count;
    }
}
