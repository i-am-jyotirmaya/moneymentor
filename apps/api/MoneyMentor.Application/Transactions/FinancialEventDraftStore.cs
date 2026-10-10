using System.Collections.Concurrent;
namespace MoneyMentor.Application.Transactions;

public sealed record FinancialEventDraft(string SourceText, TransactionIntent? Intent, IReadOnlyList<TransactionMatchCandidate> Candidates, DateTimeOffset ExpiresAt);
public sealed class FinancialEventDraftStore(TimeProvider clock)
{
    private readonly ConcurrentDictionary<(string Provider, string Subject, Guid? Household), FinancialEventDraft> drafts = new();
    public FinancialEventDraft? Get(string provider, string subject, Guid? household)
    {
        if (!drafts.TryGetValue((provider, subject, household), out var draft)) return null;
        if (draft.ExpiresAt > clock.GetUtcNow()) return draft;
        Clear(provider, subject, household); return null;
    }
    public void Save(string provider, string subject, Guid? household, FinancialEventDraft draft)
    {
        foreach (var item in drafts.Where(x => x.Value.ExpiresAt <= clock.GetUtcNow())) drafts.TryRemove(item.Key, out _);
        if (drafts.Count >= 10000) drafts.TryRemove(drafts.First().Key, out _);
        drafts[(provider, subject, household)] = draft;
    }
    public void Clear(string provider, string subject, Guid? household) => drafts.TryRemove((provider, subject, household), out _);
}
