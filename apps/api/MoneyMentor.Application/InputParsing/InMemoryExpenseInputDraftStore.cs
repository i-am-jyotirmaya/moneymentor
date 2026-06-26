using System.Collections.Concurrent;

namespace MoneyMentor.Application.InputParsing;

public sealed class InMemoryExpenseInputDraftStore : IExpenseInputDraftStore
{
    private static readonly TimeSpan DraftLifetime = TimeSpan.FromMinutes(10);

    private readonly ConcurrentDictionary<ExpenseInputDraftKey, StoredExpenseDraft> drafts = new();

    public ExpenseDraft? Get(ExpenseInputParseRequest request)
    {
        var key = ExpenseInputDraftKey.From(request);
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

    public void Save(ExpenseInputParseRequest request, ExpenseDraft draft)
    {
        var key = ExpenseInputDraftKey.From(request);
        drafts[key] = new StoredExpenseDraft(draft, DateTimeOffset.UtcNow);
    }

    public void Clear(ExpenseInputParseRequest request)
    {
        drafts.TryRemove(ExpenseInputDraftKey.From(request), out _);
    }

    private sealed record StoredExpenseDraft(ExpenseDraft Draft, DateTimeOffset UpdatedAt);

    private sealed record ExpenseInputDraftKey(
        string AuthProvider,
        string AuthSubject,
        Guid? HouseholdId)
    {
        public static ExpenseInputDraftKey From(ExpenseInputParseRequest request) =>
            new(
                request.AuthProvider.Trim().ToLowerInvariant(),
                request.AuthSubject.Trim().ToLowerInvariant(),
                request.HouseholdId);
    }
}
