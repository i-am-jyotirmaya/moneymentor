using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Infrastructure.Transactions;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed record MemoryAdmissionDecision(bool Admit, string? MemoryType,
    decimal Confidence, decimal Importance);

internal sealed class JevMemoryAdmissionClient(HttpClient client, IOptions<JevOptions> options)
{
    public bool IsEnabled => !string.IsNullOrWhiteSpace(options.Value.ApiKey);

    public async Task<MemoryAdmissionDecision?> DecideAsync(JudgmentFeedback feedback,
        string candidateType, CancellationToken cancellationToken)
    {
        var text = feedback.Text.Trim();
        if (new[] { "ok", "okay", "thanks", "thank you", "got it" }
            .Contains(text.ToLowerInvariant()))
            return new MemoryAdmissionDecision(false, null, 1m, 0m);
        if (!IsEnabled) return null;
        var request = new
        {
            model = options.Value.Model,
            state = new { text, candidateType },
            questions = new
            {
                durable = new { type = "noul",
                    instructions = "Would this explanation or preference improve future financial decisions? Generic acknowledgments are not durable." },
                memoryType = new { type = "choice", instructions = "Classify durable user context.",
                    criteria = new Dictionary<string, string?>
                    {
                        ["SpendingPreference"] = null, ["PurchaseExplanation"] = null,
                        ["RecurringException"] = null, ["ReimbursementRule"] = null,
                        ["GoalPriority"] = null, ["TemporaryContext"] = null
                    } },
                importance = new { type = "score", instructions = "How useful will this be for future decisions?",
                    criteria = new[] { "No value", "Small", "Useful", "Important", "Essential" } }
            }
        };
        using var message = new HttpRequestMessage(HttpMethod.Post, "v1/systemone")
            { Content = JsonContent.Create(request) };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        using var response = await client.SendAsync(message, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var answers = document.RootElement.GetProperty("answers");
        var durable = answers.GetProperty("durable").GetProperty("noul").GetDecimal();
        var category = answers.GetProperty("memoryType");
        var type = category.GetProperty("choice").GetString();
        var confidence = category.GetProperty("confidence").GetDecimal();
        var importance = answers.GetProperty("importance").GetProperty("score").GetDecimal();
        if (durable is < 0m or > 1m || confidence is < 0m or > 1m || importance is < 0m or > 4m
            || type is not ("SpendingPreference" or "PurchaseExplanation" or "RecurringException"
                or "ReimbursementRule" or "GoalPriority" or "TemporaryContext"))
            throw new JsonException("Jev returned an invalid memory admission decision.");
        var admit = durable >= 0.80m && confidence >= 0.70m && importance >= 1.5m;
        return new MemoryAdmissionDecision(admit, admit ? type : null, confidence, importance);
    }
}
