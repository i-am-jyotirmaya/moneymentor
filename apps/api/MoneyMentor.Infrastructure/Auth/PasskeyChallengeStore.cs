using Microsoft.EntityFrameworkCore;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Auth;

public sealed class PasskeyChallengeStore(MoneyMentorAuthDbContext db, TimeProvider clock)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(5);

    public async Task<Guid> CreateAsync(string state, Guid? sessionId, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        await db.Set<PasskeyChallenge>().Where(challenge => challenge.ExpiresAt <= now)
            .ExecuteDeleteAsync(cancellationToken);

        var challenge = new PasskeyChallenge(Guid.NewGuid(), state, sessionId, now.Add(Lifetime));
        db.Add(challenge);
        await db.SaveChangesAsync(cancellationToken);
        return challenge.Id;
    }

    public async Task<string?> ConsumeAsync(Guid id, Guid? sessionId, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        // Registration is bound to the bearer session. A null session is reserved for sign-in.
        var query = db.Set<PasskeyChallenge>().Where(challenge =>
            challenge.Id == id && challenge.SessionId == sessionId && challenge.ExpiresAt > now);
        var state = await query.Select(challenge => challenge.State).SingleOrDefaultAsync(cancellationToken);
        // Multiple requests can read the state, but only the request that deletes it may verify it.
        return state is not null && await query.ExecuteDeleteAsync(cancellationToken) == 1 ? state : null;
    }
}

internal sealed record PasskeyChallenge(Guid Id, string State, Guid? SessionId, DateTimeOffset ExpiresAt);
