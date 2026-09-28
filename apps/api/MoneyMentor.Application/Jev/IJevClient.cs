using System.Text.Json;

namespace MoneyMentor.Application.Jev;

// All Jev decisions go through this boundary. Callers define the allowed answers;
// the provider cannot introduce new categories or free-form output.
public interface IJevClient
{
    bool IsConfigured { get; }

    Task<JevDecision> DecideAsync(
        object state,
        IReadOnlyDictionary<string, JevQuestion> questions,
        CancellationToken cancellationToken, string operation = "categorization");
}

public sealed record JevQuestion(string Type, string Instructions, object? Criteria = null)
{
    public static JevQuestion Choice(string instructions, IReadOnlyDictionary<string, string> criteria) =>
        new("choice", instructions, criteria);

    public static JevQuestion Score(string instructions, IReadOnlyList<string> levels) =>
        new("score", instructions, levels);

    public static JevQuestion Noul(string instructions) => new("noul", instructions);
}

public sealed class JevDecision(JsonElement answers, string? model = null)
{
    public string? Model { get; } = model;

    public bool TryGetChoice(string question, out string choice, out double confidence)
    {
        choice = string.Empty;
        confidence = 0;
        if (!TryGetAnswer(question, "choice", out var answer)
            || !answer.TryGetProperty("choice", out var selected)
            || selected.ValueKind != JsonValueKind.String
            || !answer.TryGetProperty("confidence", out var certainty)
            || !TryProbability(certainty, out confidence))
        {
            return false;
        }

        choice = selected.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(choice);
    }

    public bool TryGetScore(string question, out double score, out double confidence)
    {
        score = confidence = 0;
        return TryGetAnswer(question, "score", out var answer)
            && answer.TryGetProperty("score", out var value)
            && value.TryGetDouble(out score)
            && double.IsFinite(score)
            && answer.TryGetProperty("confidence", out var certainty)
            && TryProbability(certainty, out confidence);
    }

    public bool TryGetNoul(string question, out double probability)
    {
        probability = 0;
        return TryGetAnswer(question, "noul", out var answer)
            && answer.TryGetProperty("noul", out var value)
            && TryProbability(value, out probability);
    }

    private bool TryGetAnswer(string question, string type, out JsonElement answer)
    {
        answer = default;
        return answers.ValueKind == JsonValueKind.Object
            && answers.TryGetProperty(question, out answer)
            && answer.ValueKind == JsonValueKind.Object
            && answer.TryGetProperty("type", out var kind)
            && kind.ValueKind == JsonValueKind.String
            && kind.GetString() == type;
    }

    private static bool TryProbability(JsonElement value, out double probability)
    {
        probability = 0;
        return value.ValueKind == JsonValueKind.Number
            && value.TryGetDouble(out probability)
            && double.IsFinite(probability)
            && probability is >= 0 and <= 1;
    }
}
