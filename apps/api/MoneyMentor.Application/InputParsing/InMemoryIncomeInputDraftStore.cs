using System.Collections.Concurrent;

namespace MoneyMentor.Application.InputParsing;

public sealed class InMemoryIncomeInputDraftStore : IIncomeInputDraftStore
{
    private static readonly TimeSpan DraftLifetime = TimeSpan.FromMinutes(10);

    private readonly ConcurrentDictionary<IncomeInputDraftKey, StoredIncomeDraft> drafts = new();

    public IncomeDraft? Get(IncomeInputParseRequest request)
    {
        var key = IncomeInputDraftKey.From(request);
        if (!drafts.TryGetValue(key, out var storedDraft))
        {
            return null;
        }

        if (DateTimeOffset.UtcNow - storedDraft.UpdatedAt > DraftLifetime)
        {
            drafts.TryRemove(key, out _);
            return null;
        }

        return storedDraft.Draft;
    }

    public void Save(IncomeInputParseRequest request, IncomeDraft draft) =>
        drafts[IncomeInputDraftKey.From(request)] = new StoredIncomeDraft(draft, DateTimeOffset.UtcNow);

    public void Clear(IncomeInputParseRequest request) =>
        drafts.TryRemove(IncomeInputDraftKey.From(request), out _);

    private sealed record StoredIncomeDraft(IncomeDraft Draft, DateTimeOffset UpdatedAt);

    private sealed record IncomeInputDraftKey(
        string AuthProvider,
        string AuthSubject,
        Guid? HouseholdId)
    {
        public static IncomeInputDraftKey From(IncomeInputParseRequest request) =>
            new(
                request.AuthProvider.Trim().ToLowerInvariant(),
                request.AuthSubject.Trim().ToLowerInvariant(),
                request.HouseholdId);
    }
}
