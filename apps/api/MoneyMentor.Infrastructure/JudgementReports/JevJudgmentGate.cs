using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Transactions;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed record JudgmentDecision(
    JudgmentDecisionAction Action, decimal Importance, decimal Confidence,
    bool NeedsLlm, bool NeedsUserIntent, string Provider, string Model, string SchemaVersion);

internal sealed class JevJudgmentGate(
    HttpClient client, IOptions<JevOptions> options, ILogger<JevJudgmentGate> logger)
{
    private const string SchemaVersion = "decision-v1";

    public async Task<JudgmentDecision> DecideAsync(JudgmentCandidate candidate,
        string contextJson, CancellationToken cancellationToken)
    {
        var config = options.Value;
        if (string.IsNullOrWhiteSpace(config.ApiKey)) return Fallback(candidate);
        try
        {
            using var context = JsonDocument.Parse(contextJson);
            var request = new
            {
                model = config.Model,
                state = context.RootElement,
                questions = new
                {
                    action = new { type = "choice", instructions =
                        "Decide if this personal financial pattern deserves attention. Ordinary discretionary spending is not inherently bad. Prefer silence when weak or explained.",
                        criteria = new Dictionary<string, string?>
                        {
                            ["IGNORE"] = "No useful observation", ["OBSERVE"] = "Factual observation",
                            ["ASK"] = "User intent is needed", ["NUDGE"] = "Helpful, grounded suggestion"
                        } },
                    importance = new { type = "score", instructions = "How important is it to the user's finances or goals?",
                        criteria = new[] { "Not important", "Minor", "Moderate", "Important", "Very important" } },
                    needsIntent = new { type = "noul", instructions = "Would user intent materially change the interpretation?" },
                    worthLlm = new { type = "noul", instructions = "Would nuanced explanation benefit from a general language model?" }
                }
            };
            using var message = new HttpRequestMessage(HttpMethod.Post, "v1/systemone")
                { Content = JsonContent.Create(request) };
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ApiKey);
            using var response = await client.SendAsync(message, cancellationToken);
            response.EnsureSuccessStatusCode();
            using var document = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            var root = document.RootElement;
            var answers = root.GetProperty("answers");
            var actionAnswer = answers.GetProperty("action");
            var choice = actionAnswer.GetProperty("choice").GetString();
            var confidence = actionAnswer.GetProperty("confidence").GetDecimal();
            var importance = answers.GetProperty("importance").GetProperty("score").GetDecimal();
            var needsIntent = answers.GetProperty("needsIntent").GetProperty("noul").GetDecimal();
            var worthLlm = answers.GetProperty("worthLlm").GetProperty("noul").GetDecimal();
            if (confidence is < 0m or > 1m || importance is < 0m or > 4m
                || needsIntent is < 0m or > 1m || worthLlm is < 0m or > 1m
                || !Enum.TryParse<JudgmentDecisionAction>(choice, true, out var action)
                || action == JudgmentDecisionAction.Alert)
                throw new JsonException("Invalid bounded Jev decision.");
            if (confidence < 0.70m)
                action = candidate.InterestingnessScore >= 0.65m && needsIntent >= 0.60m
                    ? JudgmentDecisionAction.Ask : JudgmentDecisionAction.Observe;
            return new JudgmentDecision(action, importance, confidence,
                action is JudgmentDecisionAction.Ask or JudgmentDecisionAction.Nudge && worthLlm >= 0.70m,
                needsIntent >= 0.60m, "typesafe", root.GetProperty("model").GetString() ?? config.Model, SchemaVersion);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception error)
        {
            logger.LogWarning("Jev decision unavailable ({FailureType}); using bounded deterministic fallback.",
                error.GetType().Name);
            return Fallback(candidate);
        }
    }

    private static JudgmentDecision Fallback(JudgmentCandidate candidate) =>
        new(candidate.InterestingnessScore >= 0.30m
                ? JudgmentDecisionAction.Observe : JudgmentDecisionAction.Ignore,
            candidate.InterestingnessScore * 4m, candidate.DetectorConfidence,
            false, false, "deterministic", "candidate-v1", SchemaVersion);
}
