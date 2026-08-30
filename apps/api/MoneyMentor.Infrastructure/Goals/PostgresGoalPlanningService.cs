using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;

namespace MoneyMentor.Infrastructure.Goals;

internal sealed class PostgresGoalPlanningService(
    MoneyMentorDbContext dbContext,
    IGoalService goalService,
    IGoalFinancialSnapshotBuilder snapshotBuilder,
    IHouseholdAccessService householdAccessService,
    TimeProvider timeProvider) : IGoalPlanningService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<GoalDetailModel?> GetDetailAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken)
    {
        var goal = await goalService.GetAsync(userContext, goalId, cancellationToken);
        if (goal is null)
        {
            return null;
        }

        var plan = await LoadPlanAsync(goalId, cancellationToken);
        var consent = await GetConsentAsync(userContext, goalId, cancellationToken);
        return new GoalDetailModel(goal, plan, consent);
    }

    public async Task<GoalPlanningRunModel> CreateRunAsync(
        CreateGoalPlanningRunCommand command,
        CancellationToken cancellationToken)
    {
        EnsureAiConsent(command.UserContext);
        ValidateIdempotencyKey(command.IdempotencyKey);
        ValidatePlanningInputs(command.TargetDate, command.MonthlyContribution, command.UserContext.CurrentDate);

        var existing = await dbContext.GoalPlanningRuns.AsNoTracking()
            .FirstOrDefaultAsync(item => item.RequestedByUserProfileId == command.UserContext.UserProfileId
                && item.IdempotencyKey == command.IdempotencyKey, cancellationToken);
        if (existing is not null)
        {
            return await MapRunAsync(existing, cancellationToken);
        }
        await EnforceRateLimitAsync(command.UserContext.UserProfileId, cancellationToken);

        var goal = await goalService.GetAsync(command.UserContext, command.GoalId, cancellationToken)
            ?? throw new GoalPlanningValidationException("Goal was not found.");
        var snapshot = await snapshotBuilder.BuildAsync(
            command.UserContext,
            command.GoalId,
            command.ParticipantUserProfileIds,
            command.Pace,
            command.TargetDate,
            command.MonthlyContribution,
            cancellationToken);
        var request = new StoredPlanningRequest(
            command.Pace,
            command.TargetDate,
            command.MonthlyContribution,
            command.Locale,
            null,
            command.ParticipantUserProfileIds);
        var run = new GoalPlanningRun
        {
            GoalId = goal.Id,
            RequestedByUserProfileId = command.UserContext.UserProfileId,
            RunType = GoalPlanningRunType.Generate,
            Status = GoalPlanningRunStatus.Pending,
            RequestJson = JsonSerializer.Serialize(request, JsonOptions),
            SnapshotJson = JsonSerializer.Serialize(snapshot, JsonOptions),
            PromptVersion = GoalPlanningPolicy.PromptVersion,
            SchemaVersion = GoalPlanningPolicy.SchemaVersion,
            IdempotencyKey = command.IdempotencyKey,
            CreatedAt = timeProvider.GetUtcNow()
        };
        dbContext.GoalPlanningRuns.Add(run);
        await dbContext.SaveChangesAsync(cancellationToken);
        return await MapRunAsync(run, cancellationToken);
    }

    public async Task<GoalPlanningRunModel?> GetRunAsync(
        AppUserContext userContext,
        Guid goalId,
        Guid runId,
        CancellationToken cancellationToken)
    {
        if (await goalService.GetAsync(userContext, goalId, cancellationToken) is null)
        {
            return null;
        }

        var run = await dbContext.GoalPlanningRuns.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == runId
                && item.GoalId == goalId
                && item.RequestedByUserProfileId == userContext.UserProfileId,
                cancellationToken);
        return run is null ? null : await MapRunAsync(run, cancellationToken);
    }

    public async Task<GoalPlanVersionModel?> CustomizeAsync(
        CustomizeGoalPlanCommand command,
        CancellationToken cancellationToken)
    {
        ValidatePlanningInputs(command.TargetDate, command.MonthlyContribution, command.UserContext.CurrentDate);
        var goal = await goalService.GetAsync(command.UserContext, command.GoalId, cancellationToken);
        if (goal is null)
        {
            return null;
        }

        var source = await dbContext.GoalPlanVersions.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == command.SourceVersionId, cancellationToken);
        if (source is null)
        {
            return null;
        }

        var plan = await dbContext.GoalPlans
            .FirstOrDefaultAsync(item => item.Id == source.GoalPlanId && item.GoalId == command.GoalId,
                cancellationToken);
        if (plan is null)
        {
            return null;
        }

        var snapshot = await snapshotBuilder.BuildAsync(
            command.UserContext,
            command.GoalId,
            [],
            command.Pace,
            command.TargetDate,
            command.MonthlyContribution,
            cancellationToken);
        var candidate = snapshot.Candidates.Single();
        var now = timeProvider.GetUtcNow();
        var version = new GoalPlanVersion
        {
            GoalPlanId = plan.Id,
            SourceVersionId = source.Id,
            CreatedByUserProfileId = command.UserContext.UserProfileId,
            VersionNumber = await NextVersionNumberAsync(plan.Id, cancellationToken),
            Source = GoalPlanVersionSource.Customized,
            UserContext = NormalizeContext(command.CustomizationContext),
            CreatedAt = now
        };
        var option = ToOption(
            version.Id,
            candidate,
            "Customized plan",
            "This draft uses your requested pace and the latest calculated capacity.",
            snapshot.Warnings,
            0);
        dbContext.GoalPlanVersions.Add(version);
        dbContext.GoalPlanOptions.Add(option);
        plan.UpdatedAt = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapVersion(version, [option]);
    }

    public async Task<GoalPlanningRunModel> CreateReviewRunAsync(
        CreateGoalPlanReviewRunCommand command,
        CancellationToken cancellationToken)
    {
        EnsureAiConsent(command.UserContext);
        ValidateIdempotencyKey(command.IdempotencyKey);
        var existing = await dbContext.GoalPlanningRuns.AsNoTracking()
            .FirstOrDefaultAsync(item => item.RequestedByUserProfileId == command.UserContext.UserProfileId
                && item.IdempotencyKey == command.IdempotencyKey, cancellationToken);
        if (existing is not null)
        {
            return await MapRunAsync(existing, cancellationToken);
        }
        await EnforceRateLimitAsync(command.UserContext.UserProfileId, cancellationToken);

        var source = await (
            from version in dbContext.GoalPlanVersions.AsNoTracking()
            join plan in dbContext.GoalPlans.AsNoTracking() on version.GoalPlanId equals plan.Id
            where version.Id == command.SourceVersionId && plan.GoalId == command.GoalId
            select version).FirstOrDefaultAsync(cancellationToken)
            ?? throw new GoalPlanningValidationException("Plan version was not found.");
        var sourceOption = await dbContext.GoalPlanOptions.AsNoTracking()
            .OrderBy(item => item.SortOrder)
            .FirstAsync(item => item.GoalPlanVersionId == source.Id, cancellationToken);
        var snapshot = await snapshotBuilder.BuildAsync(
            command.UserContext,
            command.GoalId,
            [],
            sourceOption.Pace,
            sourceOption.ProjectedCompletionDate,
            sourceOption.MonthlyContribution,
            cancellationToken);
        var request = new StoredPlanningRequest(
            sourceOption.Pace,
            sourceOption.ProjectedCompletionDate,
            sourceOption.MonthlyContribution,
            command.Locale,
            source.UserContext,
            []);
        var run = new GoalPlanningRun
        {
            GoalId = command.GoalId,
            RequestedByUserProfileId = command.UserContext.UserProfileId,
            SourceVersionId = source.Id,
            RunType = GoalPlanningRunType.Review,
            Status = GoalPlanningRunStatus.Pending,
            RequestJson = JsonSerializer.Serialize(request, JsonOptions),
            SnapshotJson = JsonSerializer.Serialize(snapshot, JsonOptions),
            PromptVersion = GoalPlanningPolicy.PromptVersion,
            SchemaVersion = GoalPlanningPolicy.SchemaVersion,
            IdempotencyKey = command.IdempotencyKey,
            CreatedAt = timeProvider.GetUtcNow()
        };
        dbContext.GoalPlanningRuns.Add(run);
        await dbContext.SaveChangesAsync(cancellationToken);
        return await MapRunAsync(run, cancellationToken);
    }

    public async Task<GoalPlanVersionModel?> ActivateAsync(
        AppUserContext userContext,
        Guid goalId,
        Guid versionId,
        string idempotencyKey,
        CancellationToken cancellationToken)
    {
        ValidateIdempotencyKey(idempotencyKey);
        var goal = await dbContext.FinancialGoals.FirstOrDefaultAsync(item => item.Id == goalId, cancellationToken);
        if (goal is null)
        {
            return null;
        }

        await householdAccessService.ResolveAsync(
            userContext, goal.HouseholdId, requireWrite: true, cancellationToken);
        if (goal.CreatedByUserProfileId != userContext.UserProfileId)
        {
            throw new GoalPlanningForbiddenException("Only the goal creator can follow or replace its plan.");
        }

        var plan = await dbContext.GoalPlans
            .FirstOrDefaultAsync(item => item.GoalId == goalId, cancellationToken);
        if (plan is null)
        {
            return null;
        }

        var version = await dbContext.GoalPlanVersions.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == versionId && item.GoalPlanId == plan.Id, cancellationToken);
        if (version is null)
        {
            return null;
        }

        if (plan.LastActivationIdempotencyKey != idempotencyKey)
        {
            plan.ActiveVersionId = version.Id;
            plan.Status = GoalPlanStatus.Active;
            plan.LastActivationIdempotencyKey = idempotencyKey;
            plan.UpdatedAt = timeProvider.GetUtcNow();
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var options = await dbContext.GoalPlanOptions.AsNoTracking()
            .Where(item => item.GoalPlanVersionId == version.Id)
            .OrderBy(item => item.SortOrder)
            .ToArrayAsync(cancellationToken);
        return MapVersion(version, options);
    }

    public async Task<GoalPlanParticipantConsentModel?> GetConsentAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken)
    {
        if (await goalService.GetAsync(userContext, goalId, cancellationToken) is null)
        {
            return null;
        }

        var consent = await dbContext.GoalPlanParticipantConsents.AsNoTracking()
            .FirstOrDefaultAsync(item => item.GoalId == goalId
                && item.UserProfileId == userContext.UserProfileId, cancellationToken);
        return consent is null ? null : MapConsent(consent);
    }

    public async Task<GoalPlanParticipantConsentModel> ConsentAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken)
    {
        EnsureAiConsent(userContext);
        var goal = await dbContext.FinancialGoals.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == goalId, cancellationToken)
            ?? throw new GoalPlanningValidationException("Goal was not found.");
        await householdAccessService.ResolveAsync(
            userContext, goal.HouseholdId, requireWrite: false, cancellationToken);
        if (goal.UserProfileId is not null)
        {
            throw new GoalPlanningValidationException("Participant consent applies only to shared goals.");
        }

        var now = timeProvider.GetUtcNow();
        var consent = await dbContext.GoalPlanParticipantConsents
            .FirstOrDefaultAsync(item => item.GoalId == goalId
                && item.UserProfileId == userContext.UserProfileId, cancellationToken);
        if (consent is null)
        {
            consent = new GoalPlanParticipantConsent
            {
                GoalId = goalId,
                UserProfileId = userContext.UserProfileId,
                PolicyVersion = GoalPlanningPolicy.ConsentVersion,
                ConsentedAt = now
            };
            dbContext.GoalPlanParticipantConsents.Add(consent);
        }
        else
        {
            consent.PolicyVersion = GoalPlanningPolicy.ConsentVersion;
            consent.ConsentedAt = now;
            consent.RevokedAt = null;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapConsent(consent);
    }

    public async Task<bool> RevokeConsentAsync(
        AppUserContext userContext,
        Guid goalId,
        CancellationToken cancellationToken)
    {
        var consent = await dbContext.GoalPlanParticipantConsents
            .FirstOrDefaultAsync(item => item.GoalId == goalId
                && item.UserProfileId == userContext.UserProfileId, cancellationToken);
        if (consent is null)
        {
            return false;
        }

        consent.RevokedAt = timeProvider.GetUtcNow();
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<GoalPlanSummaryModel?> LoadPlanAsync(Guid goalId, CancellationToken cancellationToken)
    {
        var plan = await dbContext.GoalPlans.AsNoTracking()
            .FirstOrDefaultAsync(item => item.GoalId == goalId, cancellationToken);
        if (plan is null)
        {
            return null;
        }

        var versions = await dbContext.GoalPlanVersions.AsNoTracking()
            .Where(item => item.GoalPlanId == plan.Id)
            .OrderByDescending(item => item.VersionNumber)
            .ToArrayAsync(cancellationToken);
        var versionIds = versions.Select(item => item.Id).ToArray();
        var options = await dbContext.GoalPlanOptions.AsNoTracking()
            .Where(item => versionIds.Contains(item.GoalPlanVersionId))
            .OrderBy(item => item.SortOrder)
            .ToArrayAsync(cancellationToken);
        return new GoalPlanSummaryModel(
            plan.Id,
            plan.Status,
            plan.ActiveVersionId,
            plan.CreatedAt,
            plan.UpdatedAt,
            versions.Select(version => MapVersion(
                version,
                options.Where(item => item.GoalPlanVersionId == version.Id).ToArray())).ToArray());
    }

    private async Task<GoalPlanningRunModel> MapRunAsync(
        GoalPlanningRun run,
        CancellationToken cancellationToken)
    {
        GoalPlanVersionModel? result = null;
        if (run.ResultVersionId is not null)
        {
            var version = await dbContext.GoalPlanVersions.AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == run.ResultVersionId.Value, cancellationToken);
            if (version is not null)
            {
                var options = await dbContext.GoalPlanOptions.AsNoTracking()
                    .Where(item => item.GoalPlanVersionId == version.Id)
                    .OrderBy(item => item.SortOrder)
                    .ToArrayAsync(cancellationToken);
                result = MapVersion(version, options);
            }
        }

        return new GoalPlanningRunModel(
            run.Id, run.GoalId, run.RunType, run.Status, run.ResultVersionId, run.Model,
            run.RetryCount, run.FailureCategory, run.Error, run.CreatedAt, run.StartedAt,
            run.CompletedAt, result);
    }

    private static GoalPlanVersionModel MapVersion(
        GoalPlanVersion version,
        IReadOnlyCollection<GoalPlanOption> options) =>
        new(
            version.Id,
            version.VersionNumber,
            version.Source,
            version.SourceVersionId,
            version.UserContext,
            version.CreatedAt,
            options.OrderBy(item => item.SortOrder).Select(MapOption).ToArray());

    private static GoalPlanOptionModel MapOption(GoalPlanOption option) =>
        new(
            option.Id,
            option.Pace,
            option.MonthlyContribution,
            option.ProjectedCompletionDate,
            option.Feasibility,
            option.IsRecommended,
            option.Title,
            option.Explanation,
            Deserialize<string>(option.TradeOffsJson),
            Deserialize<string>(option.AssumptionsJson),
            Deserialize<string>(option.RisksJson),
            Deserialize<GoalPlanMilestoneModel>(option.MilestonesJson));

    internal static GoalPlanOption ToOption(
        Guid versionId,
        GoalPlanCandidate candidate,
        string title,
        string explanation,
        IReadOnlyCollection<string> warnings,
        int sortOrder,
        IReadOnlyCollection<string>? tradeOffs = null,
        IReadOnlyCollection<string>? assumptions = null,
        IReadOnlyCollection<string>? risks = null) =>
        new()
        {
            GoalPlanVersionId = versionId,
            SortOrder = sortOrder,
            Pace = candidate.Pace,
            MonthlyContribution = candidate.MonthlyContribution,
            ProjectedCompletionDate = candidate.ProjectedCompletionDate,
            Feasibility = candidate.Feasibility,
            IsRecommended = candidate.Pace == GoalPlanPace.Balanced || sortOrder == 0,
            Title = title[..Math.Min(title.Length, 100)],
            Explanation = explanation[..Math.Min(explanation.Length, 2000)],
            TradeOffsJson = JsonSerializer.Serialize(tradeOffs ?? [], JsonOptions),
            AssumptionsJson = JsonSerializer.Serialize(assumptions ?? [], JsonOptions),
            RisksJson = JsonSerializer.Serialize((risks ?? []).Concat(warnings).Distinct(), JsonOptions),
            MilestonesJson = JsonSerializer.Serialize(BuildMilestones(candidate), JsonOptions),
            CalculationVersion = GoalPlanningPolicy.CalculationVersion
        };

    private async Task<int> NextVersionNumberAsync(Guid planId, CancellationToken cancellationToken) =>
        (await dbContext.GoalPlanVersions
            .Where(item => item.GoalPlanId == planId)
            .MaxAsync(item => (int?)item.VersionNumber, cancellationToken) ?? 0) + 1;

    private async Task EnforceRateLimitAsync(
        Guid userProfileId,
        CancellationToken cancellationToken)
    {
        var since = timeProvider.GetUtcNow().AddMinutes(-1);
        var recentRuns = await dbContext.GoalPlanningRuns.AsNoTracking()
            .CountAsync(item => item.RequestedByUserProfileId == userProfileId
                && item.CreatedAt >= since, cancellationToken);
        if (recentRuns >= 5)
        {
            throw new GoalPlanningRateLimitException(
                "You can start up to five goal planning runs per minute.");
        }
    }

    private static IReadOnlyCollection<GoalPlanMilestoneModel> BuildMilestones(GoalPlanCandidate candidate)
    {
        if (candidate.MonthlyContribution <= 0m)
        {
            return [];
        }

        return
        [
            new("First month", candidate.ProjectedCompletionDate.AddMonths(-Math.Max(0,
                MonthsBetween(DateOnly.FromDateTime(DateTime.UtcNow), candidate.ProjectedCompletionDate) - 1)),
                candidate.MonthlyContribution),
            new("Target", candidate.ProjectedCompletionDate, 0m)
        ];
    }

    private static int MonthsBetween(DateOnly start, DateOnly end) =>
        Math.Max(1, ((end.Year - start.Year) * 12) + end.Month - start.Month);

    private static IReadOnlyCollection<T> Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T[]>(json, JsonOptions) ?? [];

    private static GoalPlanParticipantConsentModel MapConsent(GoalPlanParticipantConsent consent) =>
        new(consent.GoalId, consent.UserProfileId, consent.PolicyVersion,
            consent.ConsentedAt, consent.RevokedAt);

    private static void EnsureAiConsent(AppUserContext userContext)
    {
        if (!userContext.HasCurrentPrivacyConsent)
        {
            throw new GoalPlanningConsentException(
                "Accept the current privacy policy before using AI goal planning.");
        }
    }

    private static void ValidatePlanningInputs(
        DateOnly? targetDate,
        decimal? monthlyContribution,
        DateOnly currentDate)
    {
        if (targetDate is not null && targetDate <= currentDate)
        {
            throw new GoalPlanningValidationException("Target date must be in the future.");
        }
        if (monthlyContribution is <= 0m)
        {
            throw new GoalPlanningValidationException("Monthly contribution must be greater than zero.");
        }
    }

    private static void ValidateIdempotencyKey(string idempotencyKey)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Length > 128)
        {
            throw new GoalPlanningValidationException(
                "A valid Idempotency-Key header is required.");
        }
    }

    private static string? NormalizeContext(string? context)
    {
        var value = context?.Trim();
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }
        return value[..Math.Min(value.Length, 1000)];
    }

    internal sealed record StoredPlanningRequest(
        GoalPlanPace? Pace,
        DateOnly? TargetDate,
        decimal? MonthlyContribution,
        string? Locale,
        string? CustomizationContext,
        IReadOnlyCollection<Guid> ParticipantUserProfileIds);
}
