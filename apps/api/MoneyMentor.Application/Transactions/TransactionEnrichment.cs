using System.Text.Json;
using MoneyMentor.Application.Jev;

namespace MoneyMentor.Application.Transactions;

// This is the version of the five semantic questions, not a provider model version.
public static class TransactionEnrichmentSchema
{
    public const string Version = "transaction-enrichment-v1";

    public static IReadOnlyDictionary<string, JevQuestion> Questions(
        IReadOnlyDictionary<string, string> leafCategories, string fallbackCategory)
    {
        ArgumentNullException.ThrowIfNull(leafCategories);
        if (leafCategories.Count == 0 || !leafCategories.ContainsKey(fallbackCategory))
            throw new ArgumentException("A nonempty leaf catalog must contain the fallback category.",
                nameof(leafCategories));

        return new Dictionary<string, JevQuestion>
        {
            ["category"] = JevQuestion.Choice(
                "Choose the most specific leaf category for this transaction from the available choices. "
                + "Use the purchase purpose, not the payment app or merchant alone. "
                + $"If unclear, choose {fallbackCategory}.", leafCategories),
            ["essentiality"] = JevQuestion.Score(
                "How necessary or unavoidable is this particular purchase? Judge its stated purpose, "
                + "not just the baseline category or amount.",
                [
                    "Purely optional or indulgent",
                    "Discretionary convenience",
                    "Useful but reasonably deferrable",
                    "Normally necessary",
                    "Essential or unavoidable obligation"
                ]),
            ["planned"] = JevQuestion.Noul(
                "Does transaction-local evidence indicate this purchase was planned or expected beforehand? "
                + "With no evidence either way, remain uncertain.",
                "Explicit advance planning, booking, budgeting, or an expected purchase.",
                "Explicitly spontaneous or unplanned purchase."),
            ["impulse"] = JevQuestion.Noul(
                "Does transaction-local evidence indicate a spur-of-the-moment purchase? "
                + "Do not infer impulse merely because it is discretionary, expensive, or non-essential. "
                + "With no evidence either way, remain uncertain.",
                "Explicit spontaneous or unplanned purchase intent.",
                "Explicit advance planning, an expected replacement, recurrence, or prior commitment."),
            ["committed"] = JevQuestion.Noul(
                "Does this expense represent an existing obligation, subscription, bill, recurring payment, "
                + "or previously committed expense? With no evidence either way, remain uncertain.",
                "Explicit obligation, subscription, recurring rule, or prior commitment.",
                "Explicit one-off purchase with no existing obligation.")
        };
    }
}

public sealed record TransactionIntelligenceEvidence(
    bool? UserSaidPlanned = null,
    bool? UserSaidRecurring = null,
    bool? MatchedKnownCommitment = null,
    bool? MatchedRecurringTransaction = null,
    bool? IsReplacementPurchase = null);

public sealed record TransactionIntelligenceState(
    string Type,
    decimal Amount,
    string Currency,
    string? Merchant,
    string? Description,
    string? NormalizedIntent,
    string? CategoryHint,
    DateOnly? TransactionDate,
    TransactionIntelligenceEvidence? Evidence);

public enum TransactionEnrichmentStatus
{
    Completed,
    Partial,
    SkippedUnconfigured,
    ProviderFailed,
    InvalidResponse,
    Stale
}

// Nullable signals mean that the provider did not supply a valid answer. A probability
// around 0.5 is uncertainty, not a positive assertion about the transaction.
public sealed record TransactionEnrichmentResult
{
    public string SchemaVersion { get; init; } = TransactionEnrichmentSchema.Version;
    public TransactionEnrichmentStatus Status { get; init; }
    public string? SuggestedCategory { get; init; }
    public double? CategoryConfidence { get; init; }
    public double? EssentialityScore { get; init; }
    public double? EssentialityConfidence { get; init; }
    public double? PlannedProbability { get; init; }
    public double? ImpulseProbability { get; init; }
    public double? CommittedProbability { get; init; }
    public string? Provider { get; init; }
    public string? Model { get; init; }
    public DateTimeOffset? EvaluatedAt { get; init; }
    public long? InputTokens { get; init; }
    public long? OutputTokens { get; init; }
    public JsonElement? ProviderAnswers { get; init; }
    public string? FailureCode { get; init; }
}
