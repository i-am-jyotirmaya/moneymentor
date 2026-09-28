using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Jev;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Jev;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed record JudgmentDecision(
    JudgmentDecisionAction Action, decimal Importance, decimal Confidence,
    bool NeedsLlm, bool NeedsUserIntent, string Provider, string Model, string SchemaVersion);

internal sealed class JevJudgmentGate(
    IJevClient client, IOptions<JevOptions> options, ILogger<JevJudgmentGate> logger)
{
    private const string SchemaVersion = "decision-v1";

    public async Task<JudgmentDecision> DecideAsync(JudgmentCandidate candidate,
        string contextJson, CancellationToken cancellationToken)
    {
        var config = options.Value;
        if (!client.IsConfigured) return Fallback(candidate);
        try
        {
            using var context = JsonDocument.Parse(contextJson);
            var questions = new Dictionary<string, JevQuestion>
            {
                ["action"] = JevQuestion.Choice(
                    "Decide if this personal financial pattern deserves attention. Ordinary discretionary spending is not inherently bad. Prefer silence when weak or explained.",
                    new Dictionary<string, string>
                    {
                        ["IGNORE"] = "No useful observation", ["OBSERVE"] = "Factual observation",
                        ["ASK"] = "User intent is needed", ["NUDGE"] = "Helpful, grounded suggestion"
                    }),
                ["importance"] = JevQuestion.Score("How important is it to the user's finances or goals?",
                    ["Not important", "Minor", "Moderate", "Important", "Very important"]),
                ["needsIntent"] = JevQuestion.Noul("Would user intent materially change the interpretation?"),
                ["worthLlm"] = JevQuestion.Noul("Would nuanced explanation benefit from a general language model?")
            };
            var decision = await client.DecideAsync(context.RootElement, questions, cancellationToken,
                "judgment_decision");
            if (!decision.TryGetChoice("action", out var choice, out var confidence)
                || !decision.TryGetScore("importance", out var importance, out _)
                || !decision.TryGetNoul("needsIntent", out var needsIntent)
                || !decision.TryGetNoul("worthLlm", out var worthLlm)
                || importance is < 0 or > 4
                || !Enum.TryParse<JudgmentDecisionAction>(choice, true, out var action)
                || action == JudgmentDecisionAction.Alert)
                throw new JsonException("Invalid bounded Jev decision.");
            if (confidence < 0.70)
                action = candidate.InterestingnessScore >= 0.65m && needsIntent >= 0.60
                    ? JudgmentDecisionAction.Ask : JudgmentDecisionAction.Observe;
            return new JudgmentDecision(action, (decimal)importance, (decimal)confidence,
                action is JudgmentDecisionAction.Ask or JudgmentDecisionAction.Nudge && worthLlm >= 0.70,
                needsIntent >= 0.60, "typesafe", decision.Model ?? config.Model, SchemaVersion);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception error)
        {
            logger.LogWarning("Jev decision unavailable ({FailureType}); using bounded deterministic fallback.",
                error.GetType().Name);
            return Fallback(candidate);
        }
    }

    internal static JudgmentDecision Fallback(JudgmentCandidate candidate) =>
        new(candidate.InterestingnessScore >= 0.30m
                ? JudgmentDecisionAction.Observe : JudgmentDecisionAction.Ignore,
            candidate.InterestingnessScore * 4m, candidate.DetectorConfidence,
            false, false, "deterministic", "candidate-v1", SchemaVersion);
}
