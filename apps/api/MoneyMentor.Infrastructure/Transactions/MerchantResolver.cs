using Microsoft.EntityFrameworkCore;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Transactions;

internal sealed class MerchantResolver(MoneyMentorDbContext dbContext)
{
    public async Task<Guid?> ResolveAsync(Guid householdId, string? rawName, CancellationToken cancellationToken)
    {
        var normalized = Normalize(rawName);
        if (normalized is null) return null;
        var existing = await dbContext.Merchants.AsNoTracking()
            .Where(x => x.HouseholdId == householdId &&
                (x.NormalizedName == normalized || dbContext.MerchantAliases.Any(a =>
                    a.MerchantId == x.Id && a.NormalizedAlias == normalized)))
            .Select(x => (Guid?)x.Id).FirstOrDefaultAsync(cancellationToken);
        if (existing is not null) return existing;

        var merchantId = Guid.NewGuid();
        // Unique constraint + conflict handling makes concurrent ingestion safe.
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO app.merchants ("Id", "HouseholdId", "CanonicalName", "NormalizedName", "CreatedAt", "UpdatedAt")
            VALUES ({merchantId}, {householdId}, {rawName!.Trim()}, {normalized}, now(), now())
            ON CONFLICT ("HouseholdId", "NormalizedName") DO NOTHING
            """, cancellationToken);
        return await dbContext.Merchants.AsNoTracking()
            .Where(x => x.HouseholdId == householdId && x.NormalizedName == normalized)
            .Select(x => x.Id).SingleAsync(cancellationToken);
    }

    internal static string? Normalize(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var result = string.Join(' ', text.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            .ToLowerInvariant();
        return result.Length <= 256 ? result : result[..256];
    }
}
