using System.Globalization;
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

internal sealed class JudgmentDecisionWakeup
{
    private readonly Channel<bool> _signals = Channel.CreateBounded<bool>(new BoundedChannelOptions(1)
        { FullMode = BoundedChannelFullMode.DropWrite });

    public void Signal() => _signals.Writer.TryWrite(true);

    public async Task WaitAsync(CancellationToken cancellationToken)
    {
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var signaled = _signals.Reader.WaitToReadAsync(linked.Token).AsTask();
        var recovery = Task.Delay(TimeSpan.FromHours(1), linked.Token);
        await Task.WhenAny(signaled, recovery);
        linked.Cancel();
        while (_signals.Reader.TryRead(out _)) { }
        cancellationToken.ThrowIfCancellationRequested();
    }
}

internal sealed class JudgmentDecisionService(
    MoneyMentorDbContext dbContext,
    JudgmentContextBuilder contexts,
    JevJudgmentGate gate,
    OpenAiCandidateExplanationClient explanations,
    TimeProvider clock)
{
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var token = Guid.NewGuid();
        var now = clock.GetUtcNow();
        // SKIP LOCKED allows several API instances to work on the durable queue safely.
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            WITH next AS (
                SELECT "Id" FROM app.judgment_candidates
                WHERE (("Status" = 'Queued' AND "AvailableAt" <= {now})
                    OR ("Status" = 'Evaluating' AND "LeaseExpiresAt" < {now}))
                    AND "AttemptCount" < 4
                ORDER BY "AvailableAt", "CreatedAt" LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            UPDATE app.judgment_candidates c
            SET "Status" = 'Evaluating', "ClaimToken" = {token},
                "LeaseExpiresAt" = {now.AddMinutes(5)}, "AttemptCount" = c."AttemptCount" + 1
            FROM next WHERE c."Id" = next."Id"
            """, cancellationToken);
        var candidate = await dbContext.JudgmentCandidates.AsNoTracking()
            .SingleOrDefaultAsync(x => x.ClaimToken == token, cancellationToken);
        if (candidate is null) return false;

        var started = clock.GetUtcNow();
        try
        {
            var context = await contexts.BuildAsync(candidate, cancellationToken);
            var decision = await gate.DecideAsync(candidate, context, cancellationToken);
            string? explanation = null;
            if (decision.NeedsLlm && decision.Importance >= 2.5m
                && candidate.InterestingnessScore >= 0.45m && explanations.IsEnabled
                && await HasAiConsentAsync(candidate, cancellationToken))
            {
                try
                {
                    explanation = await explanations.ExplainAsync(candidate, decision, context, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
                catch (Exception) { /* A saved deterministic explanation remains available. */ }
            }
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            var current = await dbContext.JudgmentCandidates.SingleOrDefaultAsync(x =>
                x.Id == candidate.Id && x.ClaimToken == token && x.Status == JudgmentCandidateStatus.Evaluating,
                cancellationToken);
            if (current is null) return true; // A timed-out lease has already been reclaimed.

            var alreadySurfaced = await dbContext.Judgements.AnyAsync(x => x.CandidateId == current.Id,
                cancellationToken);
            if (decision.Action != JudgmentDecisionAction.Ignore && !alreadySurfaced)
            {
                var currency = await dbContext.Households.AsNoTracking()
                    .Where(x => x.Id == current.HouseholdId).Select(x => x.CurrencyCode)
                    .SingleAsync(cancellationToken);
                dbContext.Judgements.Add(CreateJudgement(current, decision, context, currency, explanation));
            }
            current.Status = decision.Action == JudgmentDecisionAction.Ignore
                ? JudgmentCandidateStatus.Ignored : JudgmentCandidateStatus.Judged;
            current.EvaluatedAt = clock.GetUtcNow();
            current.ClaimToken = null;
            current.LeaseExpiresAt = null;
            dbContext.JudgementEvaluationRuns.Add(new JudgementEvaluationRun
            {
                CandidateId = current.Id,
                Stage = JudgementWorkStage.CandidateDecision,
                AttemptNumber = current.AttemptCount,
                Succeeded = true,
                CalculationVersion = current.CalculationVersion,
                RuleVersion = current.DetectorVersion,
                NarrationSchemaVersion = decision.SchemaVersion,
                DeterministicInputJson = current.EvidenceJson,
                ContextSnapshotJson = context,
                NarrationOutputJson = JsonSerializer.Serialize(new { decision, explanation }),
                Provider = explanation is null ? decision.Provider : "typesafe+openai",
                Model = decision.Model,
                DurationMilliseconds = (long)(clock.GetUtcNow() - started).TotalMilliseconds,
                StartedAt = started, CompletedAt = clock.GetUtcNow()
            });
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch
        {
            dbContext.ChangeTracker.Clear();
            await dbContext.JudgmentCandidates.Where(x => x.Id == candidate.Id && x.ClaimToken == token)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(x => x.Status, candidate.AttemptCount >= 4
                        ? JudgmentCandidateStatus.Pending : JudgmentCandidateStatus.Queued)
                    .SetProperty(x => x.AvailableAt, now.AddMinutes(Math.Min(60, 5 * candidate.AttemptCount)))
                    .SetProperty(x => x.ClaimToken, (Guid?)null)
                    .SetProperty(x => x.LeaseExpiresAt, (DateTimeOffset?)null), cancellationToken);
            throw;
        }
        return true;
    }

    private async Task<bool> HasAiConsentAsync(JudgmentCandidate candidate, CancellationToken cancellationToken)
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

    private Judgement CreateJudgement(JudgmentCandidate candidate, JudgmentDecision decision,
        string context, string currency, string? explanation)
    {
        var label = candidate.CandidateType switch
        {
            "CATEGORY_SPENDING_SPIKE" => "Category spending changed",
            "REPEATED_DISCRETIONARY_SPEND" => "Repeated spending observed",
            "MERCHANT_FREQUENCY" => "Merchant visits changed",
            "CATEGORY_ACCELERATION" => "Category spending accelerated",
            "SUBSCRIPTION_ACCUMULATION" => "Subscriptions add up",
            "GOAL_FUNDING_PRESSURE" => "Goal funding needs a look",
            _ => "Spending pattern observed"
        };
        var amount = candidate.CurrentValue?.ToString("0.##", CultureInfo.InvariantCulture) ?? "0";
        var reason = candidate.BaselineValue is decimal baseline
            ? $"{currency} {amount} in the recent window, compared with {currency} {baseline.ToString("0.##", CultureInfo.InvariantCulture)} in the comparable baseline."
            : $"{currency} {amount} in the recent window. Review the saved evidence for details.";
        return new Judgement
        {
            CandidateId = candidate.Id,
            HouseholdId = candidate.HouseholdId, UserProfileId = candidate.UserProfileId,
            Scope = candidate.Scope, Cadence = JudgementReportCadence.Weekly,
            SubjectType = candidate.Scope == JudgementReportScope.Personal
                ? JudgementSubjectType.UserProfile : JudgementSubjectType.Household,
            SubjectId = candidate.UserProfileId ?? candidate.HouseholdId,
            SubjectKey = candidate.SubjectKey,
            Period = candidate.WindowStart,
            RuleCode = "CANDIDATE_" + candidate.CandidateType,
            DeduplicationKey = candidate.DeduplicationKey,
            IssueKey = candidate.CandidateType + ":" + candidate.SubjectKey,
            Status = JudgementLifecycleStatus.Active,
            Direction = JudgementDirection.Neutral,
            Severity = decision.Action == JudgmentDecisionAction.Observe
                ? JudgementSeverity.Info : JudgementSeverity.Nudge,
            SeverityRank = decision.Action == JudgmentDecisionAction.Observe ? 1 : 2,
            Tone = SpendingJudgment.Watch,
            Title = label, Value = currency + " " + amount, Message = explanation ?? reason,
            InputsJson = "{}", FocusMetric = "pattern", EvidenceJson = candidate.EvidenceJson,
            ThresholdsJson = "{}", ActionCode = candidate.CandidateType,
            ActionParametersJson = "{}", CalculationVersion = candidate.CalculationVersion,
            RuleVersion = candidate.DetectorVersion, ExpiresAt = candidate.ExpiresAt ?? clock.GetUtcNow().AddDays(14),
            DecisionAction = decision.Action, Importance = decision.Importance,
            DecisionConfidence = decision.Confidence, Reason = reason,
            FollowUpQuestion = decision.Action == JudgmentDecisionAction.Ask
                ? "Was this planned, or was there a one-time reason for it?" : null,
            ContextSnapshotJson = context,
            Provider = explanation is null ? decision.Provider : "typesafe+openai",
            Model = decision.Model,
            DecisionSchemaVersion = decision.SchemaVersion
        };
    }
}

internal sealed class JudgmentDecisionWorker(
    IServiceScopeFactory scopes, JudgmentDecisionWakeup wakeup,
    ILogger<JudgmentDecisionWorker> logger) : BackgroundService
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
                    if (!await scope.ServiceProvider.GetRequiredService<JudgmentDecisionService>()
                            .ProcessNextAsync(stoppingToken)) break;
                    if (i == 19) mayHaveMore = true;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError(error, "Judgment decision processing failed."); }
            if (mayHaveMore) continue;
            try { await wakeup.WaitAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
