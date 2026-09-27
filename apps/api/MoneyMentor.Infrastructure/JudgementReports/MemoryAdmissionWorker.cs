using System.Text.Json;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class MemoryAdmissionWakeup
{
    private readonly Channel<bool> _signals = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
        { FullMode = BoundedChannelFullMode.DropWrite });
    public void Signal() => _signals.Writer.TryWrite(true);
    public async Task WaitAsync(CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var next = _signals.Reader.WaitToReadAsync(linked.Token).AsTask();
        var recovery = Task.Delay(TimeSpan.FromHours(1), linked.Token);
        await Task.WhenAny(next, recovery);
        linked.Cancel();
        while (_signals.Reader.TryRead(out _)) { }
        cancellationToken.ThrowIfCancellationRequested();
    }
}

internal sealed class MemoryAdmissionService(
    MoneyMentorDbContext dbContext,
    JevMemoryAdmissionClient jev,
    MemoryEmbeddingClient embeddings,
    FinancialMemoryStore memoryStore,
    TimeProvider clock)
{
    public bool IsEnabled => jev.IsEnabled;

    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        if (!IsEnabled) return false;
        var now = clock.GetUtcNow();
        var token = Guid.NewGuid();
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            WITH next AS (
                SELECT "Id" FROM app.judgment_feedback
                WHERE (("Status" = 'Pending' AND "AvailableAt" <= {now})
                    OR ("Status" = 'Processing' AND "LeaseExpiresAt" < {now}))
                    AND "AttemptCount" < 4
                ORDER BY "AvailableAt", "CreatedAt" LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            UPDATE app.judgment_feedback f
            SET "Status" = 'Processing', "ClaimToken" = {token},
                "LeaseExpiresAt" = {now.AddMinutes(5)}, "AttemptCount" = f."AttemptCount" + 1
            FROM next WHERE f."Id" = next."Id"
            """, cancellationToken);
        var feedback = await dbContext.JudgmentFeedback.AsNoTracking()
            .SingleOrDefaultAsync(x => x.ClaimToken == token, cancellationToken);
        if (feedback is null) return false;

        try
        {
            var hasConsent = await dbContext.PrivacyConsents.AsNoTracking().AnyAsync(x =>
                x.UserProfileId == feedback.UserProfileId && x.PolicyVersion == PrivacyPolicy.CurrentVersion,
                cancellationToken);
            if (!hasConsent)
            {
                await FinishAsync(feedback.Id, token, "NeedsConsent", null, cancellationToken);
                return true;
            }
            var judgement = await dbContext.Judgements.AsNoTracking()
                .SingleAsync(x => x.Id == feedback.JudgementId, cancellationToken);
            var decision = await jev.DecideAsync(feedback, judgement.RuleCode, cancellationToken);
            if (decision is null) throw new InvalidOperationException("Jev admission is unavailable.");
            var result = JsonSerializer.Serialize(new { provider = "typesafe", model = "jev-latest",
                schemaVersion = "memory-v1", decision });
            Guid? memoryId = null;
            await using (var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken))
            {
                var current = await dbContext.JudgmentFeedback.SingleOrDefaultAsync(x =>
                    x.Id == feedback.Id && x.ClaimToken == token && x.Status == "Processing", cancellationToken);
                if (current is null) return true;
                if (decision.Admit)
                {
                    var existing = await dbContext.FinancialContextMemories.AsNoTracking()
                        .Where(x => x.SourceFeedbackId == current.Id)
                        .Select(x => (Guid?)x.Id).FirstOrDefaultAsync(cancellationToken);
                    if (existing is null)
                    {
                        var memory = new FinancialContextMemory
                        {
                            HouseholdId = current.HouseholdId,
                            UserProfileId = current.UserProfileId,
                            Visibility = current.Visibility,
                            MemoryType = decision.MemoryType!, Text = current.Text,
                            StructuredDataJson = JsonSerializer.Serialize(new
                                { candidateId = judgement.CandidateId, judgementId = judgement.Id }),
                            SourceType = "JudgmentFeedback", SourceJudgementId = judgement.Id,
                            SourceFeedbackId = current.Id,
                            Confidence = decision.Confidence, Importance = decision.Importance,
                            ValidFrom = current.CreatedAt, ValidUntil = current.ValidUntil,
                            CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow()
                        };
                        dbContext.FinancialContextMemories.Add(memory);
                        memoryId = memory.Id;
                    }
                }
                current.Status = decision.Admit ? "Admitted" : "Discarded";
                current.AdmissionJson = result;
                current.ProcessedAt = clock.GetUtcNow();
                current.ClaimToken = null;
                current.LeaseExpiresAt = null;
                await dbContext.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            if (memoryId is Guid id && embeddings.IsEnabled)
            {
                try
                {
                    var vector = await embeddings.EmbedAsync(feedback.Text, cancellationToken);
                    if (vector is not null)
                        await memoryStore.SaveEmbeddingAsync(id, vector, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
                catch (Exception) { /* The original text remains available to SQL retrieval. */ }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch
        {
            dbContext.ChangeTracker.Clear();
            var terminal = feedback.AttemptCount >= 4;
            await dbContext.JudgmentFeedback.Where(x => x.Id == feedback.Id && x.ClaimToken == token)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.Status, terminal ? "ManualReview" : "Pending")
                    .SetProperty(x => x.AvailableAt, now.AddMinutes(Math.Min(60, 5 * feedback.AttemptCount)))
                    .SetProperty(x => x.ClaimToken, (Guid?)null)
                    .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null), cancellationToken);
            throw;
        }
        return true;
    }

    private async Task FinishAsync(Guid id, Guid token, string status, string? admissionJson,
        CancellationToken cancellationToken)
    {
        await dbContext.JudgmentFeedback.Where(x => x.Id == id && x.ClaimToken == token)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Status, status)
                .SetProperty(x => x.AdmissionJson, admissionJson)
                .SetProperty(x => x.ProcessedAt, clock.GetUtcNow())
                .SetProperty(x => x.ClaimToken, (Guid?)null)
                .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null), cancellationToken);
    }
}

internal sealed class MemoryAdmissionWorker(
    IServiceScopeFactory scopes, MemoryAdmissionWakeup wakeup,
    ILogger<MemoryAdmissionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var mayHaveMore = false;
            try
            {
                for (var i = 0; i < 20; i++)
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var service = scope.ServiceProvider.GetRequiredService<MemoryAdmissionService>();
                    if (!await service.ProcessNextAsync(stoppingToken)) break;
                    if (i == 19) mayHaveMore = true;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError(error, "Memory admission failed; the feedback remains available for retry."); }
            if (mayHaveMore) continue;
            try { await wakeup.WaitAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
