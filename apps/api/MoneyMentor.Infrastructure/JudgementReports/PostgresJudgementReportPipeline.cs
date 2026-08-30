using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class PostgresJudgementReportPipeline(
    MoneyMentorDbContext dbContext,
    IJudgementNarrationClient narrationClient,
    TimeProvider timeProvider,
    ILogger<PostgresJudgementReportPipeline> logger) : IJudgementReportPipeline
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public async Task CalculateAndPersistAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await AcquireWindowLockAsync(claim, cancellationToken);
        var now = timeProvider.GetUtcNow();
        var period = ReportingPeriodCalculator.Create(claim.Cadence, claim.PeriodStart, claim.TimeZone);
        if (period.EndDateExclusive != claim.PeriodEndExclusive || period.EndInstant > now)
        {
            throw new JudgementReportPermanentException("Only completed, valid reporting periods can be calculated.");
        }

        var current = SpendingSummaryCalculator.Calculate(
            period,
            claim.Scope,
            claim.HouseholdId,
            claim.UserProfileId,
            claim.CurrencyCode,
            await LoadTransactionsAsync(claim, cancellationToken));
        var firstTrackedDate = await GetFirstTrackedDateAsync(claim, cancellationToken);
        var historicalQuery = SummaryScopeQuery(claim)
            .Where(summary => summary.Status == SpendingSummaryStatus.Published
                && summary.WindowStart < claim.PeriodStart);
        if (firstTrackedDate is null)
        {
            historicalQuery = historicalQuery.Where(_ => false);
        }
        else
        {
            historicalQuery = historicalQuery.Where(summary => summary.WindowEndExclusive > firstTrackedDate);
        }
        var historicalEntities = await historicalQuery
            .OrderByDescending(summary => summary.WindowStart)
            .Take(ReportingPeriodCalculator.BaselineWindow(claim.Cadence))
            .ToArrayAsync(cancellationToken);
        var historical = new List<SpendingSummarySnapshot>(historicalEntities.Length);
        foreach (var entity in historicalEntities)
        {
            historical.Add(await ToSnapshotAsync(entity, cancellationToken));
        }
        var previousStart = ReportingPeriodCalculator.Previous(period).StartDate;
        var previous = historical.FirstOrDefault(item => item.Period.StartDate == previousStart);
        var comparison = SpendingSummaryComparer.Compare(current, previous, historical);
        var (evaluationOptions, ruleVersion, ruleConfigurationErrors) = await LoadRuleOptionsAsync(
            claim,
            cancellationToken);
        var evaluation = await AddGoalAndCommitmentFindingsAsync(
            DeterministicJudgementEvaluator.Evaluate(comparison, evaluationOptions),
            comparison,
            evaluationOptions,
            claim,
            cancellationToken);
        var fallback = DeterministicNarrationBuilder.Build(evaluation, comparison);

        var revision = await SummaryScopeQuery(claim)
            .Where(summary => summary.WindowStart == claim.PeriodStart)
            .Select(summary => (int?)summary.Revision)
            .MaxAsync(cancellationToken) ?? 0;
        var summary = CreateSummary(
            current,
            comparison,
            evaluation,
            previous is null
                ? null
                : historicalEntities.First(entity => entity.WindowStart == previous.Period.StartDate).Id,
            revision + 1,
            ruleVersion,
            now);
        summary.DataQualityFlagsJson = JsonSerializer.Serialize(
            BuildDataQualityFlags(current, comparison),
            JsonOptions);
        summary.GoalInputsJson = await LoadPlanningInputsJsonAsync(claim, cancellationToken);
        dbContext.SpendingSummaries.Add(summary);

        foreach (var category in comparison.Categories)
        {
            var categoryDirection = evaluation.Judgements
                .Where(finding => finding.RuleCode == "CATEGORY_CHANGE"
                    && finding.SubjectKey == category.Current.SubjectKey)
                .Select(finding => finding.Direction)
                .OrderBy(direction => direction == JudgementDirection.Negative ? 0
                    : direction == JudgementDirection.Positive ? 1 : 2)
                .FirstOrDefault(JudgementDirection.Neutral);
            dbContext.SpendingSummaryCategories.Add(CreateCategory(summary.Id, category, categoryDirection));
        }
        foreach (var finding in evaluation.Judgements)
        {
            dbContext.Judgements.Add(CreateJudgement(summary, finding, now));
        }

        var payload = new PersistedEvaluationPayload(comparison, evaluation, fallback);
        dbContext.JudgementEvaluationRuns.Add(new JudgementEvaluationRun
        {
            SpendingSummaryId = summary.Id,
            JudgementWorkItemId = claim.Id,
            Stage = JudgementWorkStage.Calculation,
            AttemptNumber = claim.AttemptCount,
            Succeeded = true,
            CalculationVersion = SpendingSummaryCalculator.CalculationVersion,
            RuleVersion = ruleVersion,
            NarrationSchemaVersion = "v1",
            DeterministicInputJson = JsonSerializer.Serialize(payload, JsonOptions),
            FailureCategory = ruleConfigurationErrors.Count == 0 ? null : "RuleConfiguration",
            Error = ruleConfigurationErrors.Count == 0
                ? null
                : string.Join(';', ruleConfigurationErrors)[..Math.Min(
                    1000,
                    string.Join(';', ruleConfigurationErrors).Length)],
            StartedAt = now,
            CompletedAt = timeProvider.GetUtcNow()
        });

        var work = await dbContext.JudgementWorkItems.SingleAsync(item => item.Id == claim.Id, cancellationToken);
        work.SpendingSummaryId = summary.Id;
        var narrationWork = await dbContext.JudgementWorkItems.FirstOrDefaultAsync(item =>
            item.HouseholdId == claim.HouseholdId
            && item.UserProfileId == claim.UserProfileId
            && item.Scope == claim.Scope
            && item.Cadence == claim.Cadence
            && item.PeriodStart == claim.PeriodStart
            && item.Stage == JudgementWorkStage.Narration,
            cancellationToken);
        if (narrationWork is null)
        {
            dbContext.JudgementWorkItems.Add(new JudgementWorkItem
            {
                HouseholdId = claim.HouseholdId,
                UserProfileId = claim.UserProfileId,
                SpendingSummaryId = summary.Id,
                Scope = claim.Scope,
                Cadence = claim.Cadence,
                Stage = JudgementWorkStage.Narration,
                PeriodStart = claim.PeriodStart,
                PeriodEndExclusive = claim.PeriodEndExclusive,
                TimeZone = claim.TimeZone,
                CurrencyCode = claim.CurrencyCode,
                Status = JudgementWorkStatus.Pending,
                RequestedGeneration = 1,
                AvailableAt = now,
                MaxAttempts = claim.MaxAttempts,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            narrationWork.SpendingSummaryId = summary.Id;
            narrationWork.RequestedGeneration++;
            if (narrationWork.Status != JudgementWorkStatus.Processing)
            {
                narrationWork.Status = JudgementWorkStatus.Pending;
                narrationWork.AvailableAt = now;
                narrationWork.AttemptCount = 0;
                narrationWork.DeadLetteredAt = null;
                narrationWork.FailureCategory = null;
                narrationWork.LastError = null;
            }
            narrationWork.UpdatedAt = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task NarrateAndPublishAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var work = await dbContext.JudgementWorkItems.AsNoTracking()
            .SingleAsync(item => item.Id == claim.Id, cancellationToken);
        if (work.SpendingSummaryId is not Guid summaryId)
        {
            throw new JudgementReportPermanentException("Narration work is missing its spending summary.");
        }
        var summary = await dbContext.SpendingSummaries.AsNoTracking()
            .SingleAsync(item => item.Id == summaryId, cancellationToken);
        var calculationRun = await dbContext.JudgementEvaluationRuns.AsNoTracking()
            .Where(item => item.SpendingSummaryId == summaryId && item.Stage == JudgementWorkStage.Calculation && item.Succeeded)
            .OrderByDescending(item => item.CompletedAt)
            .FirstAsync(cancellationToken);
        var payload = JsonSerializer.Deserialize<PersistedEvaluationPayload>(
            calculationRun.DeterministicInputJson,
            JsonOptions) ?? throw new JudgementReportPermanentException("Stored deterministic report input is invalid.");

        var hasConsent = await HasNarrationConsentAsync(summary, cancellationToken);
        var narration = payload.Fallback;
        var fallback = true;
        var startedAt = timeProvider.GetUtcNow();
        var isLatestCompletedPeriod = ReportingPeriodCalculator.GetLastCompletedPeriod(
            summary.Cadence,
            timeProvider.GetUtcNow(),
            summary.TimeZone).StartDate == summary.WindowStart;
        if (hasConsent && isLatestCompletedPeriod)
        {
            try
            {
                var narrated = await narrationClient.NarrateAsync(
                    new JudgementNarrationRequest(
                        summary.Id,
                        summary.CalculationVersion,
                        summary.RuleVersion,
                        payload.Comparison,
                        payload.Evaluation,
                        payload.Fallback),
                    cancellationToken);
                if (narrated is not null)
                {
                    narration = narrated with { IsDeterministicFallback = false };
                    fallback = false;
                }
            }
            catch (JudgementNarrationPermanentException exception)
            {
                logger.LogWarning(
                    "Judgement narration permanently failed for summary {SummaryId}: {FailureType}.",
                    summary.Id,
                    exception.GetType().Name);
            }
            catch (Exception) when (claim.AttemptCount < claim.MaxAttempts)
            {
                throw;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    "Judgement narration retries exhausted for summary {SummaryId}: {FailureType}.",
                    summary.Id,
                    exception.GetType().Name);
            }
        }

        await PublishAsync(summaryId, claim, narration, fallback, startedAt, cancellationToken);
    }

    private async Task PublishAsync(
        Guid summaryId,
        JudgementReportWorkClaim claim,
        JudgementNarration narration,
        bool fallback,
        DateTimeOffset startedAt,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await AcquireWindowLockAsync(claim, cancellationToken);
        var now = timeProvider.GetUtcNow();
        var summary = await dbContext.SpendingSummaries.SingleAsync(item => item.Id == summaryId, cancellationToken);
        if (summary.Status == SpendingSummaryStatus.Published)
        {
            await transaction.CommitAsync(cancellationToken);
            return;
        }
        var candidates = await dbContext.Judgements
            .Where(item => item.SpendingSummaryId == summaryId)
            .ToArrayAsync(cancellationToken);
        var latestPublishedStart = await dbContext.SpendingSummaries.AsNoTracking()
            .Where(item => item.Id != summary.Id
                && item.HouseholdId == summary.HouseholdId
                && item.UserProfileId == summary.UserProfileId
                && item.Scope == summary.Scope
                && item.Cadence == summary.Cadence
                && item.Status == SpendingSummaryStatus.Published)
            .Select(item => (DateOnly?)item.WindowStart)
            .MaxAsync(cancellationToken);
        var reconcilesActiveFeed = latestPublishedStart is null || summary.WindowStart >= latestPublishedStart;
        if (reconcilesActiveFeed)
        {
            var active = await dbContext.Judgements
                .Where(item => item.HouseholdId == summary.HouseholdId
                    && item.UserProfileId == summary.UserProfileId
                    && item.Scope == summary.Scope
                    && item.Cadence == summary.Cadence
                    && item.Status == JudgementLifecycleStatus.Active)
                .ToArrayAsync(cancellationToken);

            foreach (var prior in active)
            {
                var replacement = candidates.FirstOrDefault(item => item.IssueKey == prior.IssueKey);
                if (replacement is not null)
                {
                    prior.Status = JudgementLifecycleStatus.Superseded;
                    RecordLifecycle(JudgementLifecycleStatus.Superseded);
                    prior.SupersededAt = now;
                    prior.SupersededByJudgementId = replacement.Id;
                    replacement.SupersedesJudgementId = prior.Id;
                }
                else if (prior.ExpiresAt <= now)
                {
                    prior.Status = JudgementLifecycleStatus.Expired;
                    RecordLifecycle(JudgementLifecycleStatus.Expired);
                }
                else if (summary.Confidence == JudgementDataConfidence.Sufficient)
                {
                    prior.Status = JudgementLifecycleStatus.Resolved;
                    RecordLifecycle(JudgementLifecycleStatus.Resolved);
                    prior.ResolvedAt = now;
                    prior.ResolvingSummaryId = summary.Id;
                }
            }
        }
        foreach (var candidate in candidates)
        {
            candidate.Status = reconcilesActiveFeed
                ? JudgementLifecycleStatus.Active
                : JudgementLifecycleStatus.Superseded;
            RecordLifecycle(candidate.Status);
            if (!reconcilesActiveFeed)
            {
                candidate.SupersededAt = now;
            }
            candidate.Message = SelectCandidateMessage(candidate, narration);
        }

        var priorRevision = await dbContext.SpendingSummaries
            .Where(item => item.Id != summary.Id
                && item.HouseholdId == summary.HouseholdId
                && item.UserProfileId == summary.UserProfileId
                && item.Scope == summary.Scope
                && item.Cadence == summary.Cadence
                && item.WindowStart == summary.WindowStart
                && item.Status == SpendingSummaryStatus.Published)
            .ToArrayAsync(cancellationToken);
        foreach (var prior in priorRevision)
        {
            prior.Status = SpendingSummaryStatus.Superseded;
        }

        summary.NarrationHeadline = narration.Headline;
        summary.NarrationOverview = narration.Overview;
        summary.NarrationJson = JsonSerializer.Serialize(narration, JsonOptions);
        summary.NarrationStatus = fallback ? NarrationStatus.Fallback : NarrationStatus.Succeeded;
        summary.IsDeterministicFallback = fallback;
        if (fallback)
        {
            MoneyMentorTelemetry.JudgementNarrationFallbacks.Add(1);
        }
        summary.NarratedAt = now;
        summary.Status = SpendingSummaryStatus.Published;
        summary.PublishedAt = now;

        dbContext.JudgementEvaluationRuns.Add(new JudgementEvaluationRun
        {
            SpendingSummaryId = summary.Id,
            JudgementWorkItemId = claim.Id,
            Stage = JudgementWorkStage.Narration,
            AttemptNumber = claim.AttemptCount,
            Succeeded = true,
            CalculationVersion = summary.CalculationVersion,
            RuleVersion = summary.RuleVersion,
            NarrationSchemaVersion = "v1",
            DeterministicInputJson = "{}",
            NarrationOutputJson = summary.NarrationJson,
            Provider = fallback ? "deterministic" : "openai",
            DurationMilliseconds = Math.Max(0, (long)(now - startedAt).TotalMilliseconds),
            StartedAt = startedAt,
            CompletedAt = now
        });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private async Task<IReadOnlyCollection<FinancialTransactionInput>> LoadTransactionsAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Transactions.AsNoTracking().Where(transaction =>
            transaction.HouseholdId == claim.HouseholdId
            && transaction.DeletedAt == null
            && transaction.TransactionDate >= claim.PeriodStart
            && transaction.TransactionDate < claim.PeriodEndExclusive);
        query = claim.Scope == JudgementReportScope.Personal
            ? query.Where(transaction => transaction.UserProfileId == claim.UserProfileId)
            : query.Where(transaction => transaction.Visibility == TransactionVisibility.Household);

        var rows = await (
            from transaction in query
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categories
            from category in categories.DefaultIfEmpty()
            select new TransactionRow(
                transaction.Id,
                transaction.Amount,
                transaction.Type,
                transaction.TransactionDate,
                transaction.CategoryId,
                category == null ? null : category.Name,
                category == null ? null : category.Classification,
                category == null ? null : category.ParentCategoryId))
            .ToArrayAsync(cancellationToken);
        var parentIds = rows.Where(item => item.ParentCategoryId is not null)
            .Select(item => item.ParentCategoryId!.Value)
            .Distinct()
            .ToArray();
        var parents = await dbContext.Categories.AsNoTracking()
            .Where(item => parentIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);

        return rows.Select(item => new FinancialTransactionInput(
            item.Id,
            item.Amount,
            item.Type,
            item.TransactionDate,
            item.CategoryId,
            item.CategoryName,
            item.Classification,
            item.ParentCategoryId,
            item.ParentCategoryId is Guid parentId ? parents.GetValueOrDefault(parentId) : null)).ToArray();
    }

    private async Task<DateOnly?> GetFirstTrackedDateAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Transactions.AsNoTracking()
            .Where(transaction => transaction.HouseholdId == claim.HouseholdId);
        query = claim.Scope == JudgementReportScope.Personal
            ? query.Where(transaction => transaction.UserProfileId == claim.UserProfileId)
            : query.Where(transaction => transaction.Visibility == TransactionVisibility.Household);
        return await query.Select(transaction => (DateOnly?)transaction.TransactionDate)
            .MinAsync(cancellationToken);
    }

    private IQueryable<SpendingSummary> SummaryScopeQuery(JudgementReportWorkClaim claim) =>
        dbContext.SpendingSummaries.Where(summary =>
            summary.HouseholdId == claim.HouseholdId
            && summary.UserProfileId == claim.UserProfileId
            && summary.Scope == claim.Scope
            && summary.Cadence == claim.Cadence);

    private async Task<SpendingSummarySnapshot> ToSnapshotAsync(
        SpendingSummary entity,
        CancellationToken cancellationToken)
    {
        var categories = await dbContext.SpendingSummaryCategories.AsNoTracking()
            .Where(item => item.SpendingSummaryId == entity.Id)
            .Select(item => new SpendingCategorySummary(
                item.SubjectKey,
                item.ParentCategoryId ?? item.CategoryId,
                item.ParentCategoryNameSnapshot ?? item.CategoryNameSnapshot,
                item.ClassificationSnapshot,
                item.Amount,
                item.Share,
                item.TransactionCount))
            .ToArrayAsync(cancellationToken);
        return new SpendingSummarySnapshot(
            ReportingPeriodCalculator.Create(entity.Cadence, entity.WindowStart, entity.TimeZone),
            entity.Scope,
            entity.HouseholdId,
            entity.UserProfileId,
            entity.CurrencyCode,
            entity.CalculationVersion,
            Metrics(entity),
            categories,
            entity.TransactionCount,
            entity.ExpenseTransactionCount,
            entity.IncomeTransactionCount,
            entity.InvestmentTransactionCount,
            entity.TransferTransactionCount,
            entity.CategorizedTransactionCount,
            entity.UncategorizedTransactionCount,
            entity.ActiveTransactionDays,
            entity.FirstTransactionDate,
            entity.LastTransactionDate);
    }

    private async Task<(
        JudgementEvaluationOptions Options,
        string RuleVersion,
        IReadOnlyCollection<string> Errors)> LoadRuleOptionsAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var rules = await dbContext.JudgementRules.AsNoTracking()
            .Where(rule => rule.IsActive && rule.Cadence == claim.Cadence && rule.Scope == claim.Scope)
            .ToArrayAsync(cancellationToken);
        var enabled = new HashSet<string>(StringComparer.Ordinal);
        var severities = new Dictionary<string, JudgementSeverity>(StringComparer.Ordinal);
        var thresholds = new JudgementThresholds();
        var versions = new SortedSet<string>(StringComparer.Ordinal);
        var errors = new List<string>();
        foreach (var rule in rules)
        {
            try
            {
                thresholds = ApplyThresholds(thresholds, rule.ParamsJson);
                enabled.Add(rule.Code);
                severities[rule.Code] = rule.Severity;
                versions.Add(rule.RuleVersion);
            }
            catch (JsonException exception)
            {
                errors.Add($"{rule.Code}:{rule.RuleVersion}:InvalidParamsJson");
                MoneyMentorTelemetry.JudgementRuleConfigurationErrors.Add(
                    1,
                    new KeyValuePair<string, object?>("rule", rule.Code));
                logger.LogError(
                    exception,
                    "Skipping invalid judgement rule {RuleCode} version {RuleVersion}.",
                    rule.Code,
                    rule.RuleVersion);
            }
        }
        return (
            new JudgementEvaluationOptions(thresholds, enabled, severities),
            versions.Count == 0 ? "none" : string.Join('+', versions),
            errors);
    }

    private async Task<JudgementEvaluationResult> AddGoalAndCommitmentFindingsAsync(
        JudgementEvaluationResult baseEvaluation,
        SpendingSummaryComparison comparison,
        JudgementEvaluationOptions options,
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var latest = ReportingPeriodCalculator.GetLastCompletedPeriod(
            claim.Cadence,
            timeProvider.GetUtcNow(),
            claim.TimeZone);
        if (latest.StartDate != claim.PeriodStart)
        {
            return baseEvaluation;
        }

        var findings = baseEvaluation.Judgements.ToList();
        var goals = await dbContext.FinancialGoals.AsNoTracking()
            .Where(goal => goal.HouseholdId == claim.HouseholdId
                && goal.Status == FinancialGoalStatus.Active
                && (claim.Scope == JudgementReportScope.Household
                    ? goal.UserProfileId == null
                    : goal.UserProfileId == claim.UserProfileId))
            .ToArrayAsync(cancellationToken);
        if (options.IsEnabled(JudgementRuleCodes.GoalCapacity) && goals.Length > 0)
        {
            var requiredMonthly = goals.Sum(goal => RequiredMonthlyContribution(goal, claim.PeriodEndExclusive));
            var baselineSurplus = comparison.Metric(SummaryMetricCode.OperatingSurplus).Baseline;
            decimal? sustainableMonthly = baselineSurplus is null
                ? null
                : Math.Max(0m, claim.Cadence == JudgementReportCadence.Weekly
                    ? baselineSurplus.Value * 52m / 12m
                    : baselineSurplus.Value);
            if (sustainableMonthly is decimal capacity && requiredMonthly > capacity)
            {
                findings.Add(new DeterministicJudgement(
                    JudgementRuleCodes.GoalCapacity,
                    "goal-capacity",
                    JudgementDirection.Negative,
                    options.Severity(JudgementRuleCodes.GoalCapacity, JudgementSeverity.Warning),
                    SeverityRank(options.Severity(JudgementRuleCodes.GoalCapacity, JudgementSeverity.Warning)),
                    SpendingJudgment.NeedsAttention,
                    true,
                    SummaryMetricCode.OperatingSurplus,
                    null,
                    new Dictionary<string, decimal?>
                    {
                        ["requiredMonthly"] = requiredMonthly,
                        ["sustainableMonthlyCapacity"] = capacity
                    },
                    new Dictionary<string, decimal> { ["maximumCapacity"] = capacity },
                    "REBALANCE_GOAL_CONTRIBUTIONS",
                    new Dictionary<string, string>()));
            }
        }

        if (options.IsEnabled(JudgementRuleCodes.GoalPace) && goals.Length > 0)
        {
            var goalIds = goals.Select(goal => goal.Id).ToArray();
            var contributions = await dbContext.GoalContributions.AsNoTracking()
                .Where(item => goalIds.Contains(item.GoalId)
                    && item.ContributedAt >= claim.PeriodStart
                    && item.ContributedAt < claim.PeriodEndExclusive)
                .GroupBy(item => item.GoalId)
                .Select(group => new { GoalId = group.Key, Amount = group.Sum(item => item.Amount) })
                .ToDictionaryAsync(item => item.GoalId, item => item.Amount, cancellationToken);
            foreach (var goal in goals
                         .Select(goal => new
                         {
                             Goal = goal,
                             Required = claim.Cadence == JudgementReportCadence.Weekly
                                 ? RequiredMonthlyContribution(goal, claim.PeriodEndExclusive) * 12m / 52m
                                 : RequiredMonthlyContribution(goal, claim.PeriodEndExclusive),
                             Actual = contributions.GetValueOrDefault(goal.Id)
                         })
                         .Where(item => item.Required > 0m && item.Actual < item.Required * 0.8m)
                         .OrderBy(item => item.Actual / item.Required)
                         .Take(3))
            {
                findings.Add(new DeterministicJudgement(
                    JudgementRuleCodes.GoalPace,
                    $"goal:{goal.Goal.Id:N}",
                    JudgementDirection.Negative,
                    options.Severity(JudgementRuleCodes.GoalPace, JudgementSeverity.Nudge),
                    SeverityRank(options.Severity(JudgementRuleCodes.GoalPace, JudgementSeverity.Nudge)),
                    SpendingJudgment.Watch,
                    true,
                    SummaryMetricCode.ExplicitSavings,
                    goal.Goal.Id.ToString("N"),
                    new Dictionary<string, decimal?>
                    {
                        ["requiredContribution"] = goal.Required,
                        ["actualContribution"] = goal.Actual
                    },
                    new Dictionary<string, decimal> { ["minimumPacePercent"] = 80m },
                    "REVIEW_GOAL_PACE",
                    new Dictionary<string, string> { ["goalName"] = goal.Goal.Name }));
            }
        }

        if (options.IsEnabled(JudgementRuleCodes.CommitmentMissed))
        {
            var missed = await dbContext.CommitmentOccurrences.AsNoTracking()
                .Where(item => item.HouseholdId == claim.HouseholdId
                    && item.DueDate >= claim.PeriodStart
                    && item.DueDate < claim.PeriodEndExclusive
                    && item.Status == CommitmentOccurrenceStatus.Missed
                    && (claim.Scope == JudgementReportScope.Household
                        ? item.UserProfileId == null
                        : item.UserProfileId == claim.UserProfileId))
                .Join(
                    dbContext.Commitments.AsNoTracking(),
                    occurrence => occurrence.CommitmentId,
                    commitment => commitment.Id,
                    (occurrence, commitment) => new { Occurrence = occurrence, commitment.Name })
                .OrderByDescending(item => item.Occurrence.ExpectedAmount)
                .Take(3)
                .ToArrayAsync(cancellationToken);
            foreach (var item in missed)
            {
                findings.Add(new DeterministicJudgement(
                    JudgementRuleCodes.CommitmentMissed,
                    $"commitment:{item.Occurrence.CommitmentId:N}:{item.Occurrence.DueDate:yyyyMMdd}",
                    JudgementDirection.Negative,
                    options.Severity(JudgementRuleCodes.CommitmentMissed, JudgementSeverity.Nudge),
                    SeverityRank(options.Severity(JudgementRuleCodes.CommitmentMissed, JudgementSeverity.Nudge)),
                    SpendingJudgment.Watch,
                    true,
                    SummaryMetricCode.CashOutflow,
                    item.Occurrence.CommitmentId.ToString("N"),
                    new Dictionary<string, decimal?> { ["expectedAmount"] = item.Occurrence.ExpectedAmount },
                    new Dictionary<string, decimal>(),
                    "REVIEW_MISSED_COMMITMENT",
                    new Dictionary<string, string> { ["commitmentName"] = item.Name }));
            }
        }

        var ordered = findings
            .OrderByDescending(item => item.SeverityRank)
            .ThenByDescending(item => item.Direction == JudgementDirection.Negative)
            .ToArray();
        var negatives = ordered.Where(item => item.Direction == JudgementDirection.Negative).ToArray();
        var direction = negatives.Any(item => item.Severity == JudgementSeverity.Alert)
            || negatives.Count(item => item.Severity == JudgementSeverity.Warning) >= 2
                ? JudgementReportDirection.Worsened
                : ordered.Any(item => item.Direction == JudgementDirection.Positive && item.IsMaterial)
                  && !negatives.Any(item => item.Severity is JudgementSeverity.Warning or JudgementSeverity.Alert)
                    ? JudgementReportDirection.Improved
                    : baseEvaluation.Direction;
        return new JudgementEvaluationResult(direction, baseEvaluation.Confidence, ordered);
    }

    private async Task<string> LoadPlanningInputsJsonAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var latest = ReportingPeriodCalculator.GetLastCompletedPeriod(
            claim.Cadence,
            timeProvider.GetUtcNow(),
            claim.TimeZone);
        if (latest.StartDate != claim.PeriodStart)
        {
            return "{}";
        }

        var goalEntities = await dbContext.FinancialGoals.AsNoTracking()
            .Where(goal => goal.HouseholdId == claim.HouseholdId
                && goal.Status == FinancialGoalStatus.Active
                && (claim.Scope == JudgementReportScope.Household
                    ? goal.UserProfileId == null
                    : goal.UserProfileId == claim.UserProfileId))
            .ToArrayAsync(cancellationToken);
        var goals = goalEntities.Select(goal => new
            {
                goal.Id,
                goal.TargetAmount,
                goal.CurrentAmount,
                goal.TargetDate,
                goal.MonthlyTarget,
                goal.Priority,
                RequiredMonthlyContribution = RequiredMonthlyContribution(goal, claim.PeriodEndExclusive)
            })
            .ToArray();
        var occurrences = await dbContext.CommitmentOccurrences.AsNoTracking()
            .Where(item => item.HouseholdId == claim.HouseholdId
                && item.DueDate >= claim.PeriodStart
                && item.DueDate < claim.PeriodEndExclusive
                && (claim.Scope == JudgementReportScope.Household
                    ? item.UserProfileId == null
                    : item.UserProfileId == claim.UserProfileId))
            .Select(item => new
            {
                item.CommitmentId,
                item.DueDate,
                item.ExpectedAmount,
                item.TransactionType,
                item.Status
            })
            .ToArrayAsync(cancellationToken);

        return JsonSerializer.Serialize(new
        {
            AsOf = claim.PeriodEndExclusive,
            Goals = goals,
            CommitmentOccurrences = occurrences
        }, JsonOptions);
    }

    private static IReadOnlyCollection<string> BuildDataQualityFlags(
        SpendingSummarySnapshot current,
        SpendingSummaryComparison comparison)
    {
        var flags = new List<string>();
        if (current.TransactionCount == 0)
        {
            flags.Add("NoTransactions");
        }
        if (current.Metrics.Income == 0m)
        {
            flags.Add("ZeroIncome");
        }
        if (current.Metrics.UncategorizedShare >= 10m)
        {
            flags.Add("HighUncategorizedShare");
        }
        if (comparison.Confidence == JudgementDataConfidence.Low)
        {
            flags.Add("InsufficientHistory");
        }
        return flags;
    }

    private static decimal RequiredMonthlyContribution(FinancialGoal goal, DateOnly periodEndExclusive)
    {
        if (goal.MonthlyTarget is decimal target && target > 0m)
        {
            return target;
        }
        if (goal.TargetDate is not DateOnly targetDate)
        {
            return 0m;
        }
        var remaining = Math.Max(0m, goal.TargetAmount - goal.CurrentAmount);
        var effectiveDate = periodEndExclusive.AddDays(-1);
        var months = Math.Max(1, (targetDate.Year - effectiveDate.Year) * 12 + targetDate.Month - effectiveDate.Month + 1);
        return remaining / months;
    }

    private static int SeverityRank(JudgementSeverity severity) => severity switch
    {
        JudgementSeverity.Info => 1,
        JudgementSeverity.Nudge => 2,
        JudgementSeverity.Warning => 3,
        JudgementSeverity.Alert => 4,
        _ => 0
    };

    private static void RecordLifecycle(JudgementLifecycleStatus status) =>
        MoneyMentorTelemetry.JudgementLifecycleTransitions.Add(
            1,
            new KeyValuePair<string, object?>("status", status.ToString()));

    private async Task<bool> HasNarrationConsentAsync(
        SpendingSummary summary,
        CancellationToken cancellationToken)
    {
        Guid? consentingUserId = summary.UserProfileId;
        if (summary.Scope == JudgementReportScope.Household)
        {
            consentingUserId = await dbContext.HouseholdMembers.AsNoTracking()
                .Where(member => member.HouseholdId == summary.HouseholdId
                    && member.Status == HouseholdMemberStatus.Active
                    && member.Role == HouseholdRole.Owner)
                .Select(member => (Guid?)member.UserProfileId)
                .FirstOrDefaultAsync(cancellationToken);
        }
        return consentingUserId is Guid userId
            && await dbContext.PrivacyConsents.AsNoTracking().AnyAsync(
                consent => consent.UserProfileId == userId
                    && consent.PolicyVersion == PrivacyPolicy.CurrentVersion,
                cancellationToken);
    }

    private async Task AcquireWindowLockAsync(
        JudgementReportWorkClaim claim,
        CancellationToken cancellationToken)
    {
        var key = $"{claim.HouseholdId:N}:{claim.UserProfileId?.ToString("N") ?? "household"}:{claim.Scope}:{claim.Cadence}:{claim.PeriodStart:yyyyMMdd}";
        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))",
            cancellationToken);
    }

    private static SpendingSummary CreateSummary(
        SpendingSummarySnapshot current,
        SpendingSummaryComparison comparison,
        JudgementEvaluationResult evaluation,
        Guid? previousSummaryId,
        int revision,
        string ruleVersion,
        DateTimeOffset now) => new()
    {
        HouseholdId = current.HouseholdId,
        UserProfileId = current.UserProfileId,
        Scope = current.Scope,
        Cadence = current.Period.Cadence,
        WindowStart = current.Period.StartDate,
        WindowEndExclusive = current.Period.EndDateExclusive,
        TimeZone = current.Period.TimeZone,
        CurrencyCode = current.CurrencyCode,
        Revision = revision,
        CalculationVersion = current.CalculationVersion,
        RuleVersion = ruleVersion,
        Status = SpendingSummaryStatus.AwaitingNarration,
        Direction = evaluation.Direction,
        Confidence = evaluation.Confidence,
        Income = current.Metrics.Income,
        ExplicitSavings = current.Metrics.ExplicitSavings,
        ConsumptionSpend = current.Metrics.ConsumptionSpend,
        EssentialSpend = current.Metrics.EssentialSpend,
        DiscretionarySpend = current.Metrics.DiscretionarySpend,
        DebtSpend = current.Metrics.DebtSpend,
        UncategorizedSpend = current.Metrics.UncategorizedSpend,
        CashOutflow = current.Metrics.CashOutflow,
        OperatingSurplus = current.Metrics.OperatingSurplus,
        CashBalance = current.Metrics.CashBalance,
        SavingsRate = current.Metrics.SavingsRate,
        SavingsAllocationRate = current.Metrics.SavingsAllocationRate,
        ExpenseToIncomeRate = current.Metrics.ExpenseToIncomeRate,
        EssentialShare = current.Metrics.EssentialShare,
        DiscretionaryShare = current.Metrics.DiscretionaryShare,
        DebtShare = current.Metrics.DebtShare,
        UncategorizedShare = current.Metrics.UncategorizedShare,
        TransactionCount = current.TransactionCount,
        ExpenseTransactionCount = current.ExpenseTransactionCount,
        IncomeTransactionCount = current.IncomeTransactionCount,
        InvestmentTransactionCount = current.InvestmentTransactionCount,
        TransferTransactionCount = current.TransferTransactionCount,
        CategorizedTransactionCount = current.CategorizedTransactionCount,
        UncategorizedTransactionCount = current.UncategorizedTransactionCount,
        ActiveTransactionDays = current.ActiveTransactionDays,
        FirstTransactionDate = current.FirstTransactionDate,
        LastTransactionDate = current.LastTransactionDate,
        PreviousSummaryId = previousSummaryId,
        BaselinePeriodCount = comparison.BaselinePeriodsUsed,
        RequiredBaselinePeriodCount = comparison.RequiredBaselinePeriods,
        MetricsComparisonJson = JsonSerializer.Serialize(comparison.Metrics.Values, JsonOptions),
        NarrationStatus = NarrationStatus.Pending,
        CalculatedAt = now
    };

    private static SpendingSummaryCategory CreateCategory(
        Guid summaryId,
        CategoryComparison item,
        JudgementDirection direction) => new()
    {
        SpendingSummaryId = summaryId,
        SubjectKey = item.Current.SubjectKey,
        CategoryId = item.Current.CategoryId,
        ParentCategoryId = item.Current.CategoryId,
        CategoryNameSnapshot = item.Current.CategoryName,
        ParentCategoryNameSnapshot = item.Current.CategoryName,
        ClassificationSnapshot = item.Current.Classification,
        Amount = item.Current.Amount,
        Share = item.Current.Share,
        TransactionCount = item.Current.TransactionCount,
        PreviousAmount = item.PreviousAmount,
        PreviousDeltaAmount = item.PreviousDeltaAmount,
        PreviousDeltaPercent = item.PreviousDeltaPercent,
        PreviousTrend = item.PreviousTrend,
        BaselineAmount = item.BaselineAmount,
        BaselineDeltaAmount = item.BaselineDeltaAmount,
        BaselineDeltaPercent = item.BaselineDeltaPercent,
        BaselineTrend = item.BaselineTrend,
        PreviousShare = item.PreviousShare,
        PreviousShareDeltaPoints = item.PreviousShareDeltaPoints,
        BaselineShare = item.BaselineShare,
        BaselineShareDeltaPoints = item.BaselineShareDeltaPoints,
        IsNew = item.BaselineTrend == MetricTrend.NewActivity,
        IsStopped = item.BaselineTrend == MetricTrend.StoppedActivity,
        IsMaterial = item.IsMaterial,
        Direction = direction
    };

    private static Judgement CreateJudgement(
        SpendingSummary summary,
        DeterministicJudgement finding,
        DateTimeOffset now) => new()
    {
        RuleCode = finding.RuleCode,
        DeduplicationKey = finding.IssueKey,
        IssueKey = finding.IssueKey,
        SubjectKey = finding.SubjectKey ?? string.Empty,
        SubjectType = summary.Scope == JudgementReportScope.Household
            ? JudgementSubjectType.Household
            : JudgementSubjectType.UserProfile,
        SubjectId = summary.UserProfileId ?? summary.HouseholdId,
        HouseholdId = summary.HouseholdId,
        UserProfileId = summary.UserProfileId,
        Period = summary.WindowStart,
        Scope = summary.Scope,
        Cadence = summary.Cadence,
        SpendingSummaryId = summary.Id,
        Status = JudgementLifecycleStatus.PendingNarration,
        Direction = finding.Direction,
        Severity = finding.Severity,
        SeverityRank = finding.SeverityRank,
        Tone = finding.Tone,
        Title = Title(finding),
        Value = Value(finding),
        Message = DeterministicMessage(finding),
        InputsJson = JsonSerializer.Serialize(finding.Evidence, JsonOptions),
        FocusMetric = finding.FocusMetric.ToString(),
        EvidenceJson = JsonSerializer.Serialize(finding.Evidence, JsonOptions),
        ThresholdsJson = JsonSerializer.Serialize(finding.Thresholds, JsonOptions),
        ActionCode = finding.ActionCode,
        ActionParametersJson = JsonSerializer.Serialize(finding.ActionParameters, JsonOptions),
        CalculationVersion = summary.CalculationVersion,
        RuleVersion = summary.RuleVersion,
        ExpiresAt = ReportingPeriodCalculator.Create(summary.Cadence, summary.WindowStart, summary.TimeZone).EndInstant
            .AddDays(summary.Cadence == JudgementReportCadence.Weekly ? 14 : 62),
        CreatedAt = now
    };

    private static SummaryMetrics Metrics(SpendingSummary entity) => new(
        entity.Income, entity.ExplicitSavings, entity.ConsumptionSpend, entity.EssentialSpend,
        entity.DiscretionarySpend, entity.DebtSpend, entity.UncategorizedSpend, entity.CashOutflow,
        entity.OperatingSurplus, entity.CashBalance, entity.SavingsRate, entity.SavingsAllocationRate,
        entity.ExpenseToIncomeRate, entity.EssentialShare, entity.DiscretionaryShare,
        entity.DebtShare, entity.UncategorizedShare);

    private static JudgementThresholds ApplyThresholds(JudgementThresholds current, string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Trim() == "{}")
        {
            return current;
        }
        var value = JsonSerializer.Deserialize<ThresholdOverrides>(json, JsonOptions)
            ?? throw new JsonException("Rule parameters are empty.");
        var updated = current with
        {
            HealthySavingsRate = value.HealthySavingsRate ?? current.HealthySavingsRate,
            LowSavingsRate = value.LowSavingsRate ?? current.LowSavingsRate,
            SavingsRateTrendNudgePoints = value.SavingsRateTrendNudgePoints ?? current.SavingsRateTrendNudgePoints,
            SavingsRateTrendWarningPoints = value.SavingsRateTrendWarningPoints ?? current.SavingsRateTrendWarningPoints,
            ConsumptionNudgePercent = value.ConsumptionNudgePercent ?? current.ConsumptionNudgePercent,
            ConsumptionWarningPercent = value.ConsumptionWarningPercent ?? current.ConsumptionWarningPercent,
            ConsumptionRiskyPercent = value.ConsumptionRiskyPercent ?? current.ConsumptionRiskyPercent,
            IncomeNudgePercent = value.IncomeNudgePercent ?? current.IncomeNudgePercent,
            IncomeWarningPercent = value.IncomeWarningPercent ?? current.IncomeWarningPercent,
            DiscretionaryWatchShare = value.DiscretionaryWatchShare ?? current.DiscretionaryWatchShare,
            DiscretionaryWarningShare = value.DiscretionaryWarningShare ?? current.DiscretionaryWarningShare,
            DiscretionaryTrendPoints = value.DiscretionaryTrendPoints ?? current.DiscretionaryTrendPoints,
            DiscretionaryWarningTrendPoints = value.DiscretionaryWarningTrendPoints ?? current.DiscretionaryWarningTrendPoints,
            CategorySpikePercent = value.CategorySpikePercent ?? current.CategorySpikePercent,
            CategorySevereSpikePercent = value.CategorySevereSpikePercent ?? current.CategorySevereSpikePercent,
            CategoryShareDeltaPoints = value.CategoryShareDeltaPoints ?? current.CategoryShareDeltaPoints,
            CategoryMinimumShare = value.CategoryMinimumShare ?? current.CategoryMinimumShare,
            NewCategoryShare = value.NewCategoryShare ?? current.NewCategoryShare,
            UncategorizedWatchShare = value.UncategorizedWatchShare ?? current.UncategorizedWatchShare,
            UncategorizedWarningShare = value.UncategorizedWarningShare ?? current.UncategorizedWarningShare
        };
        ValidateThresholds(updated);
        return updated;
    }

    private static void ValidateThresholds(JudgementThresholds thresholds)
    {
        var values = thresholds.GetType().GetProperties()
            .Where(property => property.PropertyType == typeof(decimal))
            .Select(property => (decimal)property.GetValue(thresholds)!);
        if (values.Any(value => value < 0m)
            || thresholds.LowSavingsRate > thresholds.HealthySavingsRate
            || thresholds.ConsumptionNudgePercent > thresholds.ConsumptionWarningPercent
            || thresholds.ConsumptionWarningPercent > thresholds.ConsumptionRiskyPercent
            || thresholds.IncomeNudgePercent > thresholds.IncomeWarningPercent
            || thresholds.DiscretionaryWatchShare > thresholds.DiscretionaryWarningShare
            || thresholds.UncategorizedWatchShare > thresholds.UncategorizedWarningShare)
        {
            throw new JsonException("Rule threshold parameters are invalid.");
        }
    }

    private static string Title(DeterministicJudgement finding) => finding.RuleCode switch
    {
        JudgementRuleCodes.CashflowSavings => "Savings and cashflow",
        JudgementRuleCodes.ConsumptionChange => "Spending change",
        JudgementRuleCodes.IncomeChange => "Income change",
        JudgementRuleCodes.DiscretionaryShare => "Discretionary spending",
        JudgementRuleCodes.CategoryChange => finding.ActionParameters.GetValueOrDefault("categoryName") ?? "Category change",
        JudgementRuleCodes.UncategorizedData => "Improve transaction categories",
        _ => "Financial pattern"
    };

    private static string Value(DeterministicJudgement finding) =>
        finding.Evidence.GetValueOrDefault("baselineChangePercent") is decimal change
            ? $"{change:+0.#;-0.#;0}%"
            : finding.Evidence.GetValueOrDefault("savingsRate") is decimal rate
                ? $"{rate:0.#}%"
                : finding.Tone.ToString();

    private static string DeterministicMessage(DeterministicJudgement finding) =>
        finding.Direction switch
        {
            JudgementDirection.Positive => "Based on your tracked data, this pattern improved compared with your history.",
            JudgementDirection.Negative => "Based on your tracked data, this pattern needs attention compared with your history.",
            _ => "Based on your tracked data, review this result before deciding on a change."
        };

    private static string SelectCandidateMessage(Judgement candidate, JudgementNarration narration)
    {
        var category = JsonSerializer.Deserialize<Dictionary<string, string>>(candidate.ActionParametersJson, JsonOptions)
            ?.GetValueOrDefault("categoryName");
        return narration.WhatChanged.FirstOrDefault(item => category is not null && item.Contains(category, StringComparison.OrdinalIgnoreCase))
            ?? candidate.Message;
    }

    private sealed record PersistedEvaluationPayload(
        SpendingSummaryComparison Comparison,
        JudgementEvaluationResult Evaluation,
        JudgementNarration Fallback);

    private sealed record TransactionRow(
        Guid Id,
        decimal Amount,
        TransactionType Type,
        DateOnly TransactionDate,
        Guid? CategoryId,
        string? CategoryName,
        CategoryClassification? Classification,
        Guid? ParentCategoryId);

    [JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
    private sealed record ThresholdOverrides(
        decimal? HealthySavingsRate,
        decimal? LowSavingsRate,
        decimal? SavingsRateTrendNudgePoints,
        decimal? SavingsRateTrendWarningPoints,
        decimal? ConsumptionNudgePercent,
        decimal? ConsumptionWarningPercent,
        decimal? ConsumptionRiskyPercent,
        decimal? IncomeNudgePercent,
        decimal? IncomeWarningPercent,
        decimal? DiscretionaryWatchShare,
        decimal? DiscretionaryWarningShare,
        decimal? DiscretionaryTrendPoints,
        decimal? DiscretionaryWarningTrendPoints,
        decimal? CategorySpikePercent,
        decimal? CategorySevereSpikePercent,
        decimal? CategoryShareDeltaPoints,
        decimal? CategoryMinimumShare,
        decimal? NewCategoryShare,
        decimal? UncategorizedWatchShare,
        decimal? UncategorizedWarningShare);
}
