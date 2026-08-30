using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.JudgementReports;

internal sealed class PostgresJudgementReportService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    TimeProvider timeProvider) : IJudgementReportService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public async Task<JudgementReportModel?> GetAsync(
        JudgementReportRequest request,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            request.UserContext,
            request.HouseholdId,
            requireWrite: false,
            cancellationToken);
        if (request.Scope == JudgementReportScope.Household && access.Kind == HouseholdKind.Personal)
        {
            return null;
        }

        var scopeQuery = ScopeQuery(request, access.HouseholdId);
        var query = scopeQuery
            .Where(summary => summary.Status == SpendingSummaryStatus.Published);
        DateOnly? requestedStart = null;
        if (!string.IsNullOrWhiteSpace(request.Period))
        {
            requestedStart = ParsePeriod(request.Cadence, request.Period);
            query = query.Where(summary => summary.WindowStart == requestedStart);
        }

        var published = await query
            .OrderByDescending(item => item.WindowStart)
            .ThenByDescending(item => item.Revision)
            .FirstOrDefaultAsync(cancellationToken);
        var pendingQuery = scopeQuery
            .Where(summary => summary.Status == SpendingSummaryStatus.AwaitingNarration);
        if (requestedStart is not null)
        {
            pendingQuery = pendingQuery.Where(summary => summary.WindowStart == requestedStart);
        }
        var pending = await pendingQuery
            .OrderByDescending(item => item.WindowStart)
            .ThenByDescending(item => item.Revision)
            .FirstOrDefaultAsync(cancellationToken);
        var summary = published ?? pending;
        var isProcessingUpdate = pending is not null
            && (published is null
                || pending.WindowStart > published.WindowStart
                || pending.WindowStart == published.WindowStart && pending.Revision > published.Revision);
        return summary is null
            ? null
            : await MapAsync(summary, request.UserContext.UserProfileId, isProcessingUpdate, cancellationToken);
    }

    public async Task<IReadOnlyCollection<JudgementReportModel>> ListHistoryAsync(
        JudgementReportRequest request,
        string? before,
        int limit,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            request.UserContext,
            request.HouseholdId,
            requireWrite: false,
            cancellationToken);
        if (request.Scope == JudgementReportScope.Household && access.Kind == HouseholdKind.Personal)
        {
            return [];
        }

        var query = ScopeQuery(request, access.HouseholdId)
            .Where(summary => summary.Status == SpendingSummaryStatus.Published);
        if (!string.IsNullOrWhiteSpace(before))
        {
            var beforeStart = ParsePeriod(request.Cadence, before);
            query = query.Where(summary => summary.WindowStart < beforeStart);
        }

        var summaries = await query
            .OrderByDescending(item => item.WindowStart)
            .ThenByDescending(item => item.Revision)
            .Take(Math.Clamp(limit, 1, 24))
            .ToArrayAsync(cancellationToken);
        var reports = new List<JudgementReportModel>(summaries.Length);
        foreach (var summary in summaries)
        {
            reports.Add(await MapAsync(summary, request.UserContext.UserProfileId, false, cancellationToken));
        }
        return reports;
    }

    public async Task<IReadOnlyCollection<JudgementReportObservationModel>> ListActiveAsync(
        JudgementReportRequest request,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            request.UserContext,
            request.HouseholdId,
            requireWrite: false,
            cancellationToken);
        if (request.Scope == JudgementReportScope.Household && access.Kind == HouseholdKind.Personal)
        {
            return [];
        }

        var now = timeProvider.GetUtcNow();
        var userId = request.UserContext.UserProfileId;
        var rows = await dbContext.Judgements.AsNoTracking()
            .Where(item => item.HouseholdId == access.HouseholdId
                && item.Scope == request.Scope
                && item.Cadence == request.Cadence
                && item.Status == JudgementLifecycleStatus.Active
                && item.ExpiresAt > now
                && (request.Scope == JudgementReportScope.Household
                    ? item.UserProfileId == null
                    : item.UserProfileId == userId))
            .GroupJoin(
                dbContext.JudgementUserStates.AsNoTracking().Where(state => state.UserProfileId == userId),
                judgement => judgement.Id,
                state => state.JudgementId,
                (judgement, states) => new { Judgement = judgement, State = states.FirstOrDefault() })
            .Where(row => row.State == null
                || row.State.DismissedAt == null && (row.State.SnoozedUntil == null || row.State.SnoozedUntil <= now))
            .OrderByDescending(row => row.Judgement.SeverityRank)
            .ThenByDescending(row => row.Judgement.CreatedAt)
            .Take(24)
            .ToArrayAsync(cancellationToken);

        return rows.Select(row => MapObservation(row.Judgement, dismissed: false)).ToArray();
    }

    private IQueryable<SpendingSummary> ScopeQuery(JudgementReportRequest request, Guid householdId) =>
        dbContext.SpendingSummaries.AsNoTracking().Where(summary =>
            summary.HouseholdId == householdId
            && summary.Scope == request.Scope
            && summary.Cadence == request.Cadence
            && (request.Scope == JudgementReportScope.Household
                ? summary.UserProfileId == null
                : summary.UserProfileId == request.UserContext.UserProfileId));

    private async Task<JudgementReportModel> MapAsync(
        SpendingSummary summary,
        Guid viewerId,
        bool isProcessingUpdate,
        CancellationToken cancellationToken)
    {
        var categories = await dbContext.SpendingSummaryCategories.AsNoTracking()
            .Where(item => item.SpendingSummaryId == summary.Id)
            .OrderByDescending(item => item.Amount)
            .ToArrayAsync(cancellationToken);
        var judgements = await dbContext.Judgements.AsNoTracking()
            .Where(item => item.SpendingSummaryId == summary.Id)
            .GroupJoin(
                dbContext.JudgementUserStates.AsNoTracking().Where(state => state.UserProfileId == viewerId),
                judgement => judgement.Id,
                state => state.JudgementId,
                (judgement, states) => new { Judgement = judgement, State = states.FirstOrDefault() })
            .OrderByDescending(row => row.Judgement.SeverityRank)
            .ToArrayAsync(cancellationToken);

        var comparisons = Deserialize<IReadOnlyCollection<MetricComparison>>(summary.MetricsComparisonJson) ?? [];
        var comparisonMap = comparisons.ToDictionary(item => item.Metric);
        var metrics = Enum.GetValues<SummaryMetricCode>().Select(code =>
        {
            comparisonMap.TryGetValue(code, out var item);
            return new JudgementReportMetricModel(
                code,
                Current(summary, code),
                item?.Previous,
                item?.Baseline,
                item?.PreviousDelta,
                item?.PreviousDeltaPercent,
                item?.BaselineDelta,
                item?.BaselineDeltaPercent,
                item?.PreviousTrend ?? MetricTrend.NotAvailable,
                item?.BaselineTrend ?? MetricTrend.NotAvailable);
        }).ToArray();

        var narration = Deserialize<JudgementNarration>(summary.NarrationJson);
        var period = ReportingPeriodCalculator.Create(summary.Cadence, summary.WindowStart, summary.TimeZone);
        return new JudgementReportModel(
            summary.Id,
            summary.HouseholdId,
            summary.UserProfileId,
            summary.Scope,
            summary.Cadence,
            period.Key,
            summary.WindowStart,
            summary.WindowEndExclusive,
            summary.TimeZone,
            summary.CurrencyCode,
            summary.Revision,
            summary.CalculationVersion,
            summary.Status,
            summary.Direction,
            summary.Confidence,
            summary.BaselinePeriodCount,
            Deserialize<IReadOnlyCollection<string>>(summary.DataQualityFlagsJson) ?? [],
            metrics,
            categories.Select(MapCategory).ToArray(),
            judgements.Select(row => MapObservation(row.Judgement, row.State?.DismissedAt is not null)).ToArray(),
            narration,
            summary.NarrationStatus,
            isProcessingUpdate,
            summary.CalculatedAt,
            summary.PublishedAt);
    }

    private static JudgementReportCategoryModel MapCategory(SpendingSummaryCategory item) => new(
        item.SubjectKey,
        item.ParentCategoryId ?? item.CategoryId,
        item.ParentCategoryNameSnapshot ?? item.CategoryNameSnapshot,
        item.ClassificationSnapshot,
        item.Amount,
        item.Share,
        item.TransactionCount,
        item.PreviousAmount,
        item.PreviousDeltaAmount,
        item.PreviousDeltaPercent,
        item.BaselineAmount,
        item.BaselineDeltaAmount,
        item.BaselineDeltaPercent,
        item.BaselineShareDeltaPoints,
        item.BaselineTrend,
        item.IsMaterial,
        item.Direction);

    private static JudgementReportObservationModel MapObservation(Judgement item, bool dismissed) => new(
        item.Id,
        item.RuleCode,
        item.IssueKey,
        item.Direction,
        item.Severity,
        item.SeverityRank,
        item.Tone,
        item.Status,
        item.Title,
        item.Value,
        item.Message,
        item.ActionCode,
        item.ActionParametersJson,
        item.EvidenceJson,
        item.ResolvedAt,
        item.ExpiresAt,
        dismissed);

    private static decimal? Current(SpendingSummary summary, SummaryMetricCode code) => code switch
    {
        SummaryMetricCode.Income => summary.Income,
        SummaryMetricCode.ExplicitSavings => summary.ExplicitSavings,
        SummaryMetricCode.ConsumptionSpend => summary.ConsumptionSpend,
        SummaryMetricCode.EssentialSpend => summary.EssentialSpend,
        SummaryMetricCode.DiscretionarySpend => summary.DiscretionarySpend,
        SummaryMetricCode.DebtSpend => summary.DebtSpend,
        SummaryMetricCode.UncategorizedSpend => summary.UncategorizedSpend,
        SummaryMetricCode.CashOutflow => summary.CashOutflow,
        SummaryMetricCode.OperatingSurplus => summary.OperatingSurplus,
        SummaryMetricCode.CashBalance => summary.CashBalance,
        SummaryMetricCode.SavingsRate => summary.SavingsRate,
        SummaryMetricCode.SavingsAllocationRate => summary.SavingsAllocationRate,
        SummaryMetricCode.ExpenseToIncomeRate => summary.ExpenseToIncomeRate,
        SummaryMetricCode.EssentialShare => summary.EssentialShare,
        SummaryMetricCode.DiscretionaryShare => summary.DiscretionaryShare,
        SummaryMetricCode.DebtShare => summary.DebtShare,
        SummaryMetricCode.UncategorizedShare => summary.UncategorizedShare,
        _ => null
    };

    private static DateOnly ParsePeriod(JudgementReportCadence cadence, string value)
    {
        if (cadence == JudgementReportCadence.Monthly)
        {
            return DateOnly.ParseExact($"{value}-01", "yyyy-MM-dd", CultureInfo.InvariantCulture);
        }
        var parts = value.Split("-W", StringSplitOptions.None);
        var monday = ISOWeek.ToDateTime(int.Parse(parts[0], CultureInfo.InvariantCulture), int.Parse(parts[1], CultureInfo.InvariantCulture), DayOfWeek.Monday);
        return DateOnly.FromDateTime(monday);
    }

    private static T? Deserialize<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOptions);
        }
        catch (JsonException)
        {
            return default;
        }
    }
}
