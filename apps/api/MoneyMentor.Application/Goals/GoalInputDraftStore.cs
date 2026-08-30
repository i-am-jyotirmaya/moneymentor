using System.Collections.Concurrent;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Goals;

public sealed record GoalInputDraft(
    string SourceText,
    string Name,
    decimal? TargetAmount,
    int? DurationMonths,
    DateOnly? TargetDate,
    GoalPlanPace? Pace,
    DateTimeOffset ExpiresAt);

public interface IGoalInputDraftStore
{
    bool TryGet(string authProvider, string authSubject, out GoalInputDraft? draft);

    void Set(string authProvider, string authSubject, GoalInputDraft draft);

    void Remove(string authProvider, string authSubject);
}

public sealed class InMemoryGoalInputDraftStore(TimeProvider timeProvider) : IGoalInputDraftStore
{
    private readonly ConcurrentDictionary<string, GoalInputDraft> drafts = new();

    public bool TryGet(string authProvider, string authSubject, out GoalInputDraft? draft)
    {
        if (drafts.TryGetValue(Key(authProvider, authSubject), out draft)
            && draft.ExpiresAt > timeProvider.GetUtcNow())
        {
            return true;
        }
        drafts.TryRemove(Key(authProvider, authSubject), out _);
        draft = null;
        return false;
    }

    public void Set(string authProvider, string authSubject, GoalInputDraft draft) =>
        drafts[Key(authProvider, authSubject)] = draft;

    public void Remove(string authProvider, string authSubject) =>
        drafts.TryRemove(Key(authProvider, authSubject), out _);

    private static string Key(string provider, string subject) =>
        $"{provider.Trim().ToLowerInvariant()}:{subject.Trim()}";
}
