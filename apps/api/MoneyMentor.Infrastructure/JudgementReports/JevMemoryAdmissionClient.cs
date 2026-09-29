using System.Text.Json;
using MoneyMentor.Application.Jev;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed record MemoryAdmissionDecision(bool Admit, string? MemoryType,
    decimal Confidence, decimal Importance);

internal sealed class JevMemoryAdmissionClient(IJevClient client)
{
    public bool IsEnabled => client.IsConfigured;

    public async Task<MemoryAdmissionDecision?> DecideAsync(JudgmentFeedback feedback,
        string candidateType, CancellationToken cancellationToken)
    {
        var text = feedback.Text.Trim();
        if (new[] { "ok", "okay", "thanks", "thank you", "got it" }
            .Contains(text.ToLowerInvariant()))
            return new MemoryAdmissionDecision(false, null, 1m, 0m);
        if (!IsEnabled) return null;
        var questions = new Dictionary<string, JevQuestion>
        {
            ["durable"] = JevQuestion.Noul(
                "Would this explanation or preference improve future financial decisions? Generic acknowledgments are not durable."),
            ["memoryType"] = JevQuestion.Choice("Classify durable user context.",
                new Dictionary<string, string>
                {
                    ["SpendingPreference"] = "Long-term spending preference",
                    ["PurchaseExplanation"] = "Reason for a purchase",
                    ["RecurringException"] = "Exception to a recurring pattern",
                    ["ReimbursementRule"] = "Expected reimbursement",
                    ["GoalPriority"] = "Priority of a financial goal",
                    ["TemporaryContext"] = "Short-lived financial context"
                }),
            ["importance"] = JevQuestion.Score("How useful will this be for future decisions?",
                ["No value", "Small", "Useful", "Important", "Essential"])
        };
        var decision = await client.DecideAsync(new { text, candidateType }, questions, cancellationToken,
            "memory_admission");
        if (!decision.TryGetNoul("durable", out var durable)
            || !decision.TryGetChoice("memoryType", out var type, out var confidence)
            || !decision.TryGetScore("importance", out var importance, out _)
            || importance is < 0 or > 4
            || type is not ("SpendingPreference" or "PurchaseExplanation" or "RecurringException"
                or "ReimbursementRule" or "GoalPriority" or "TemporaryContext"))
            throw new JsonException("Jev returned an invalid memory admission decision.");
        var admit = durable >= 0.80 && confidence >= 0.70 && importance >= 1.5;
        return new MemoryAdmissionDecision(admit, admit ? type : null, (decimal)confidence, (decimal)importance);
    }
}
