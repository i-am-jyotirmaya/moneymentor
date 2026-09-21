using MoneyMentor.Application.InputParsing;

namespace MoneyMentor.Application.Assistant;

// Same single-instance lifetime as existing clarification stores. No image data.
public sealed class AssistantConfirmationStore(TimeProvider? timeProvider = null)
{
    private readonly object gate = new();
    private readonly Dictionary<string, Entry> entries = new();
    private DateTimeOffset Now => (timeProvider ?? TimeProvider.System).GetUtcNow();

    public string Add(AssistantMessageCommand command, ExpenseDraft? expense, IncomeDraft? income)
    {
        lock (gate)
        {
            foreach (var key in entries.Where(pair => pair.Value.ExpiresAt <= Now
                || Matches(pair.Value.Command, command)).Select(pair => pair.Key).ToArray())
                entries.Remove(key);
            if (entries.Count >= 2000) throw new InvalidOperationException("Too many pending previews. Please retry later.");
            var token = Guid.NewGuid().ToString("N");
            entries.Add(token, new Entry(command, expense, income, Now.AddMinutes(10)));
            return token;
        }
    }

    public Entry? Take(string token, AssistantMessageCommand command)
    {
        lock (gate)
        {
            if (!entries.TryGetValue(token, out var entry) || !Matches(entry.Command, command)) return null;
            entries.Remove(token); // Consume atomically before execution; never replay a write.
            return entry.ExpiresAt > Now ? entry : null;
        }
    }

    private static bool Matches(AssistantMessageCommand a, AssistantMessageCommand b) =>
        a.AuthProvider == b.AuthProvider && a.AuthSubject == b.AuthSubject && a.HouseholdId == b.HouseholdId;

    public sealed record Entry(AssistantMessageCommand Command, ExpenseDraft? Expense, IncomeDraft? Income, DateTimeOffset ExpiresAt);
}
