using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Jev;

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
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException("Jev:ApiKey is not configured.");
        }

        if (questions.Count == 0)
        {
            throw new ArgumentException("At least one question is required.", nameof(questions));
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, "v1/systemone");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        message.Content = JsonContent.Create(new { model = options.Value.Model, state, questions });

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(options.Value.TimeoutSeconds, 1, 30)));
        using var response = await httpClient.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        response.EnsureSuccessStatusCode();
        using var body = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(timeout.Token), cancellationToken: timeout.Token);
        if (!body.RootElement.TryGetProperty("answers", out var answers)
            || answers.ValueKind != JsonValueKind.Object)
        {
            throw new JsonException("Jev response is missing answers.");
        }

        return new JevDecision(answers.Clone());
    }
}
