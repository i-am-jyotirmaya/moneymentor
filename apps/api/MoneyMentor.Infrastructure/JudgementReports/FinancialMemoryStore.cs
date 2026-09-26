using System.Data;
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class MemoryEmbeddingClient(HttpClient client, IOptions<OpenAiGoalPlanningOptions> options)
{
    public const int Dimensions = 1536;
    public const string Model = "text-embedding-3-small";
    public bool IsEnabled => !string.IsNullOrWhiteSpace(options.Value.ApiKey);

    public async Task<float[]?> EmbedAsync(string text, CancellationToken cancellationToken)
    {
        if (!IsEnabled) return null;
        using var request = new HttpRequestMessage(HttpMethod.Post, "embeddings")
        {
            Content = JsonContent.Create(new { model = Model, input = text, dimensions = Dimensions })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        var values = document.RootElement.GetProperty("data")[0].GetProperty("embedding")
            .EnumerateArray().Select(x => x.GetSingle()).ToArray();
        if (values.Length != Dimensions || values.Any(x => !float.IsFinite(x)))
            throw new JsonException("Embedding provider returned invalid dimensions or values.");
        return values;
    }

    public static string ToVectorLiteral(float[] values)
    {
        if (values.Length != Dimensions || values.Any(x => !float.IsFinite(x)))
            throw new ArgumentException("Embedding must have 1536 finite dimensions.", nameof(values));
        return "[" + string.Join(',', values.Select(x => x.ToString("R", CultureInfo.InvariantCulture))) + "]";
    }
}

internal sealed class FinancialMemoryStore(
    MoneyMentorDbContext dbContext,
    MemoryEmbeddingClient embeddings,
    TimeProvider clock)
{
    public async Task<IReadOnlyList<FinancialContextMemory>> GetRelevantAsync(
        JudgmentCandidate candidate, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var query = dbContext.FinancialContextMemories.AsNoTracking().Where(x =>
            x.HouseholdId == candidate.HouseholdId && x.IsActive
            && (x.ValidFrom == null || x.ValidFrom <= now)
            && (x.ValidUntil == null || x.ValidUntil > now));
        query = candidate.Scope == JudgementReportScope.Personal
            ? query.Where(x => x.UserProfileId == candidate.UserProfileId)
            : query.Where(x => x.Visibility == TransactionVisibility.Household &&
                dbContext.HouseholdMembers.Any(member => member.HouseholdId == candidate.HouseholdId
                    && member.UserProfileId == x.UserProfileId
                    && member.Status == HouseholdMemberStatus.Active));
        var authorized = await query.OrderByDescending(x => x.Importance).ThenByDescending(x => x.CreatedAt)
            .Take(100).ToArrayAsync(cancellationToken);
        if (authorized.Length == 0) return [];

        var consent = await HasAiConsentAsync(candidate, cancellationToken);
        if (!consent || !embeddings.IsEnabled || !authorized.Any(x => x.EmbeddingModel == MemoryEmbeddingClient.Model))
            return authorized.Take(5).ToArray();
        try
        {
            var description = candidate.CandidateType + " " + candidate.SubjectKey;
            var vector = await embeddings.EmbedAsync(description, cancellationToken);
            if (vector is null) return authorized.Take(5).ToArray();
            var ids = await RankAsync(authorized.Select(x => x.Id).ToArray(),
                MemoryEmbeddingClient.ToVectorLiteral(vector), cancellationToken);
            var byId = authorized.ToDictionary(x => x.Id);
            var ranked = ids.Where(byId.ContainsKey).Select(id => byId[id]).ToList();
            return ranked.Count == 0 ? authorized.Take(5).ToArray() : ranked;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception) { return authorized.Take(5).ToArray(); }
    }

    public async Task SaveEmbeddingAsync(Guid memoryId, float[] vector, CancellationToken cancellationToken)
    {
        var literal = MemoryEmbeddingClient.ToVectorLiteral(vector);
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE app.financial_context_memories
            SET "Embedding" = CAST({literal} AS vector(1536)), "EmbeddingModel" = {MemoryEmbeddingClient.Model},
                "UpdatedAt" = {clock.GetUtcNow()}
            WHERE "Id" = {memoryId}
            """, cancellationToken);
    }

    public async Task<bool> HasAiConsentAsync(JudgmentCandidate candidate, CancellationToken cancellationToken)
    {
        if (candidate.Scope == JudgementReportScope.Personal)
            return candidate.UserProfileId is Guid userId
                && await dbContext.PrivacyConsents.AsNoTracking().AnyAsync(x =>
                    x.UserProfileId == userId && x.PolicyVersion == PrivacyPolicy.CurrentVersion,
                    cancellationToken);
        var members = await dbContext.HouseholdMembers.AsNoTracking()
            .Where(x => x.HouseholdId == candidate.HouseholdId && x.Status == HouseholdMemberStatus.Active)
            .Select(x => x.UserProfileId).ToArrayAsync(cancellationToken);
        if (members.Length == 0) return false;
        var consented = await dbContext.PrivacyConsents.AsNoTracking()
            .Where(x => members.Contains(x.UserProfileId) && x.PolicyVersion == PrivacyPolicy.CurrentVersion)
            .Select(x => x.UserProfileId).Distinct().CountAsync(cancellationToken);
        return consented == members.Distinct().Count();
    }

    private async Task<Guid[]> RankAsync(Guid[] authorizedIds, string literal, CancellationToken cancellationToken)
    {
        var connection = dbContext.Database.GetDbConnection();
        var mustClose = connection.State != ConnectionState.Open;
        if (mustClose) await connection.OpenAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT "Id" FROM app.financial_context_memories
                WHERE "Id" = ANY(@ids) AND "Embedding" IS NOT NULL
                ORDER BY "Embedding" <=> CAST(@embedding AS vector(1536)) LIMIT 5
                """;
            var ids = command.CreateParameter();
            ids.ParameterName = "ids";
            ids.Value = authorizedIds;
            command.Parameters.Add(ids);
            var embedding = command.CreateParameter();
            embedding.ParameterName = "embedding";
            embedding.Value = literal;
            command.Parameters.Add(embedding);
            var result = new List<Guid>();
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) result.Add(reader.GetGuid(0));
            return result.ToArray();
        }
        finally { if (mustClose) await connection.CloseAsync(); }
    }
}
