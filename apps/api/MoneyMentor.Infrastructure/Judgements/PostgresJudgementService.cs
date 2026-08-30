using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Update;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Judgements;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Persistence;
using Npgsql;

namespace MoneyMentor.Infrastructure.Judgements;

internal sealed class PostgresJudgementService(
    MoneyMentorDbContext dbContext,
    IHouseholdAccessService householdAccessService,
    TimeProvider timeProvider) : IJudgementService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyCollection<JudgementModel>> EvaluateMonthlyAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        IReadOnlyCollection<TransactionModel> transactions,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);
        var period = new DateOnly(month.Year, month.Month, 1);
        var candidates = new List<JudgementCandidate>();
        candidates.AddRange(BuildCashflowJudgements(access.HouseholdId, userContext.UserProfileId, period, transactions));
        candidates.AddRange(await BuildCategorySpikeJudgementsAsync(
            access.HouseholdId,
            userContext,
            period,
            transactions,
            cancellationToken));
        candidates.AddRange(await BuildGoalJudgementsAsync(access.HouseholdId, userContext, period, cancellationToken));
        candidates.AddRange(await BuildCommitmentJudgementsAsync(access.HouseholdId, userContext.UserProfileId, period, cancellationToken));

        var deduplicatedCandidates = candidates
            .GroupBy(candidate => new
            {
                candidate.HouseholdId,
                candidate.UserProfileId,
                candidate.Period,
                candidate.RuleCode,
                candidate.DeduplicationKey
            })
            .Select(group => group.OrderByDescending(candidate => candidate.Severity).First())
            .ToArray();

        await UpsertJudgementsAsync(deduplicatedCandidates, cancellationToken);
        return await ListAsync(userContext, access.HouseholdId, period, cancellationToken);
    }

    private async Task UpsertJudgementsAsync(
        IReadOnlyCollection<JudgementCandidate> candidates,
        CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 2; attempt++)
        {
            foreach (var candidate in candidates)
            {
                var existing = await dbContext.Judgements.FirstOrDefaultAsync(
                    judgement => judgement.HouseholdId == candidate.HouseholdId
                        && judgement.UserProfileId == candidate.UserProfileId
                        && judgement.Period == candidate.Period
                        && judgement.RuleCode == candidate.RuleCode
                        && judgement.DeduplicationKey == candidate.DeduplicationKey
                        && judgement.DismissedAt == null,
                    cancellationToken);
                if (existing is null)
                {
                    dbContext.Judgements.Add(candidate.ToEntity(timeProvider.GetUtcNow()));
                    continue;
                }

                existing.Severity = candidate.Severity;
                existing.Tone = candidate.Tone;
                existing.Title = candidate.Title;
                existing.Value = candidate.Value;
                existing.Message = candidate.Message;
                existing.InputsJson = candidate.InputsJson;
            }

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex) && attempt == 0)
            {
                dbContext.ChangeTracker.Clear();
            }
        }
    }

    public async Task<IReadOnlyCollection<JudgementModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        CancellationToken cancellationToken)
    {
        var access = await householdAccessService.ResolveAsync(
            userContext,
            householdId,
            requireWrite: false,
            cancellationToken);
        var period = new DateOnly(month.Year, month.Month, 1);

        var judgements = await dbContext.Judgements
            .AsNoTracking()
            .Where(judgement => judgement.HouseholdId == access.HouseholdId
                && judgement.Period == period
                && judgement.SpendingSummaryId != null
                && judgement.Status != JudgementLifecycleStatus.PendingNarration
                && (judgement.UserProfileId == null || judgement.UserProfileId == userContext.UserProfileId))
            .GroupJoin(
                dbContext.JudgementUserStates.AsNoTracking()
                    .Where(state => state.UserProfileId == userContext.UserProfileId),
                judgement => judgement.Id,
                state => state.JudgementId,
                (judgement, states) => new { Judgement = judgement, State = states.FirstOrDefault() })
            .Where(row => row.State == null || row.State.DismissedAt == null)
            .OrderByDescending(row => row.Judgement.SeverityRank)
            .ThenBy(row => row.Judgement.CreatedAt)
            .Take(12)
            .ToArrayAsync(cancellationToken);

        return judgements.Select(row => Map(row.Judgement, row.State?.DismissedAt)).ToArray();
    }

    public async Task<bool> DismissAsync(
        AppUserContext userContext,
        Guid judgementId,
        CancellationToken cancellationToken)
    {
        var judgement = await dbContext.Judgements.FirstOrDefaultAsync(
            item => item.Id == judgementId,
            cancellationToken);
        if (judgement is null)
        {
            return false;
        }

        await householdAccessService.ResolveAsync(
            userContext,
            judgement.HouseholdId,
            requireWrite: false,
            cancellationToken);
        if (judgement.UserProfileId is not null && judgement.UserProfileId != userContext.UserProfileId)
        {
            return false;
        }

        var now = timeProvider.GetUtcNow();
        var state = await dbContext.JudgementUserStates.FirstOrDefaultAsync(
            item => item.JudgementId == judgementId
                && item.UserProfileId == userContext.UserProfileId,
            cancellationToken);
        if (state is null)
        {
            state = new JudgementUserState
            {
                JudgementId = judgementId,
                UserProfileId = userContext.UserProfileId,
                DismissedAt = now,
                CreatedAt = now,
                UpdatedAt = now
            };
            dbContext.JudgementUserStates.Add(state);
        }
        else
        {
            state.DismissedAt = now;
            state.UpdatedAt = now;
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static IEnumerable<JudgementCandidate> BuildCashflowJudgements(
        Guid householdId,
        Guid userProfileId,
        DateOnly period,
        IReadOnlyCollection<TransactionModel> transactions)
    {
        var income = transactions
            .Where(transaction => transaction.Type == TransactionType.Income)
            .Sum(transaction => transaction.Amount);
        var expenses = transactions
            .Where(transaction => transaction.Type == TransactionType.Expense)
            .Sum(transaction => transaction.Amount);
        var savingsRate = income > 0m
            ? decimal.Round((income - expenses) / income * 100m, 1)
            : (decimal?)null;

        if (income > 0m && savingsRate < 20m)
        {
            yield return Candidate(
                "SAVINGS_RATE_LOW",
                "cashflow",
                householdId,
                userProfileId,
                period,
                JudgementSeverity.Warning,
                SpendingJudgment.NeedsAttention,
                "Savings watch",
                $"{savingsRate:0.#}%",
                $"You saved {savingsRate:0.#}% of income; the current target is 20%.",
                new { income, expenses, savingsRate, target = 20m });
        }

        if (income > 0m && expenses > income)
        {
            var gap = expenses - income;
            yield return Candidate(
                "NEGATIVE_CASHFLOW",
                "cashflow",
                householdId,
                userProfileId,
                period,
                JudgementSeverity.Alert,
                SpendingJudgment.Critical,
                "Negative cashflow",
                gap.ToString("0.##"),
                $"You spent {gap:0.##} more than you earned this month.",
                new { income, expenses, gap });
        }

        if (expenses > 0m)
        {
            var discretionary = transactions
                .Where(transaction => transaction.Type == TransactionType.Expense
                    && transaction.CategoryClassification == CategoryClassification.Discretionary)
                .Sum(transaction => transaction.Amount);
            var discretionaryShare = decimal.Round(discretionary / expenses * 100m, 1);
            if (discretionaryShare > 40m)
            {
                yield return Candidate(
                    "DISCRETIONARY_HIGH",
                    "discretionary",
                    householdId,
                    userProfileId,
                    period,
                    JudgementSeverity.Nudge,
                    SpendingJudgment.Watch,
                    "Discretionary watch",
                    $"{discretionaryShare:0.#}%",
                    $"Discretionary spending is {discretionaryShare:0.#}% of your outflow this month.",
                    new { expenses, discretionary, discretionaryShare, target = 40m });
            }
        }
    }

    private async Task<IEnumerable<JudgementCandidate>> BuildCategorySpikeJudgementsAsync(
        Guid householdId,
        AppUserContext userContext,
        DateOnly period,
        IReadOnlyCollection<TransactionModel> transactions,
        CancellationToken cancellationToken)
    {
        var currentGroups = transactions
            .Where(transaction => transaction.Type == TransactionType.Expense)
            .GroupBy(transaction => transaction.ParentCategoryName ?? transaction.CategoryName ?? "Uncategorized")
            .Select(group => new
            {
                Category = group.Key,
                Amount = group.Sum(transaction => transaction.Amount)
            })
            .Where(group => group.Amount > 0m)
            .ToArray();
        if (currentGroups.Length == 0)
        {
            return [];
        }

        var historyStart = period.AddMonths(-3);
        var historyEnd = period;
        var historicalTransactions = await dbContext.Transactions
            .AsNoTracking()
            .Where(transaction => transaction.HouseholdId == householdId
                && transaction.DeletedAt == null
                && transaction.Type == TransactionType.Expense
                && transaction.TransactionDate >= historyStart
                && transaction.TransactionDate < historyEnd
                && (transaction.UserProfileId == userContext.UserProfileId
                    || transaction.Visibility == TransactionVisibility.Household))
            .Select(transaction => new
            {
                transaction.Amount,
                transaction.CategoryId
            })
            .ToArrayAsync(cancellationToken);
        if (historicalTransactions.Length == 0)
        {
            return [];
        }

        var categoryIds = historicalTransactions
            .Select(transaction => transaction.CategoryId)
            .OfType<Guid>()
            .Distinct()
            .ToArray();
        var categories = await dbContext.Categories
            .AsNoTracking()
            .Where(category => categoryIds.Contains(category.Id))
            .Select(category => new
            {
                category.Id,
                category.Name,
                category.ParentCategoryId
            })
            .ToDictionaryAsync(category => category.Id, cancellationToken);
        var parentIds = categories.Values
            .Select(category => category.ParentCategoryId)
            .OfType<Guid>()
            .Distinct()
            .ToArray();
        var parentNames = await dbContext.Categories
            .AsNoTracking()
            .Where(category => parentIds.Contains(category.Id))
            .ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);

        var historicalAverage = historicalTransactions
            .GroupBy(transaction =>
            {
                if (transaction.CategoryId is null
                    || !categories.TryGetValue(transaction.CategoryId.Value, out var category))
                {
                    return "Uncategorized";
                }

                return category.ParentCategoryId is null
                    ? category.Name
                    : parentNames.GetValueOrDefault(category.ParentCategoryId.Value, category.Name);
            })
            .ToDictionary(group => group.Key, group => group.Sum(transaction => transaction.Amount) / 3m);

        var candidates = new List<JudgementCandidate>();
        foreach (var current in currentGroups)
        {
            if (!historicalAverage.TryGetValue(current.Category, out var average) || average <= 0m)
            {
                continue;
            }

            var ratio = current.Amount / average;
            if (ratio <= 1.30m)
            {
                continue;
            }

            var pct = decimal.Round((ratio - 1m) * 100m, 1);
            candidates.Add(Candidate(
                "CATEGORY_SPIKE",
                Key("category", current.Category),
                householdId,
                userContext.UserProfileId,
                period,
                JudgementSeverity.Warning,
                SpendingJudgment.NeedsAttention,
                "Category spike",
                current.Category,
                $"{current.Category} is {pct:0.#}% above your 3-month average.",
                new { current.Category, actual = current.Amount, average, pct, thresholdPct = 30m }));
        }

        return candidates;
    }

    private async Task<IEnumerable<JudgementCandidate>> BuildGoalJudgementsAsync(
        Guid householdId,
        AppUserContext userContext,
        DateOnly period,
        CancellationToken cancellationToken)
    {
        var goals = await dbContext.FinancialGoals
            .AsNoTracking()
            .Where(goal => goal.HouseholdId == householdId
                && goal.Status == FinancialGoalStatus.Active
                && (goal.UserProfileId == null || goal.UserProfileId == userContext.UserProfileId))
            .ToArrayAsync(cancellationToken);
        if (goals.Length == 0)
        {
            return [];
        }

        var contributionCutoff = userContext.CurrentDate.AddMonths(-3);
        var goalIds = goals.Select(goal => goal.Id).ToArray();
        var contributions = await dbContext.GoalContributions
            .AsNoTracking()
            .Where(contribution => goalIds.Contains(contribution.GoalId)
                && contribution.ContributedAt >= contributionCutoff)
            .GroupBy(contribution => contribution.GoalId)
            .Select(group => new
            {
                GoalId = group.Key,
                MonthlyPace = group.Sum(contribution => contribution.Amount) / 3m
            })
            .ToDictionaryAsync(item => item.GoalId, item => item.MonthlyPace, cancellationToken);

        var candidates = new List<JudgementCandidate>();
        foreach (var goal in goals)
        {
            var remaining = Math.Max(0m, goal.TargetAmount - goal.CurrentAmount);
            if (goal.TargetDate is null || remaining <= 0m)
            {
                continue;
            }

            var monthsRemaining = Math.Max(
                1,
                ((goal.TargetDate.Value.Year - userContext.CurrentDate.Year) * 12)
                + goal.TargetDate.Value.Month
                - userContext.CurrentDate.Month);
            var requiredMonthly = decimal.Round(remaining / monthsRemaining, 2);
            contributions.TryGetValue(goal.Id, out var pace);
            if (pace <= 0m)
            {
                candidates.Add(Candidate(
                    "GOAL_OFF_TRACK",
                    Key("goal", goal.Id.ToString("N")),
                    householdId,
                    goal.UserProfileId,
                    period,
                    JudgementSeverity.Warning,
                    SpendingJudgment.NeedsAttention,
                    "Goal off track",
                    goal.Name,
                    $"{goal.Name} has no recent contributions and needs {requiredMonthly:0.##}/month.",
                    new { goalId = goal.Id, goal.Name, remaining, monthsRemaining, requiredMonthly, monthlyPace = pace }));
                continue;
            }

            var projectedMonths = (int)Math.Ceiling(remaining / pace);
            var projectedDate = userContext.CurrentDate.AddMonths(projectedMonths);
            if (projectedDate > goal.TargetDate.Value)
            {
                candidates.Add(Candidate(
                    "GOAL_OFF_TRACK",
                    Key("goal", goal.Id.ToString("N")),
                    householdId,
                    goal.UserProfileId,
                    period,
                    JudgementSeverity.Warning,
                    SpendingJudgment.NeedsAttention,
                    "Goal off track",
                    goal.Name,
                    $"{goal.Name} is projected after its target date at your recent pace.",
                    new { goalId = goal.Id, goal.Name, remaining, monthlyPace = pace, projectedDate, goal.TargetDate }));
            }
        }

        var totalRequired = goals
            .Where(goal => goal.TargetDate is not null)
            .Sum(goal =>
            {
                var remaining = Math.Max(0m, goal.TargetAmount - goal.CurrentAmount);
                var months = Math.Max(
                    1,
                    ((goal.TargetDate!.Value.Year - userContext.CurrentDate.Year) * 12)
                    + goal.TargetDate.Value.Month
                    - userContext.CurrentDate.Month);
                return remaining / months;
            });
        // Available surplus is evaluated in the cashflow rule; this persisted rule records the competing demand.
        if (totalRequired > 0m && goals.Count(goal => goal.TargetDate is not null) > 1)
        {
            candidates.Add(Candidate(
                "GOAL_CONFLICT",
                "household-goals",
                householdId,
                null,
                period,
                JudgementSeverity.Nudge,
                SpendingJudgment.Watch,
                "Goal load",
                $"{totalRequired:0.##}/mo",
                $"Active goals together need about {totalRequired:0.##}/month.",
                new { totalRequiredMonthly = totalRequired, goalCount = goals.Length }));
        }

        return candidates;
    }

    private async Task<IEnumerable<JudgementCandidate>> BuildCommitmentJudgementsAsync(
        Guid householdId,
        Guid userProfileId,
        DateOnly period,
        CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        var overdue = await dbContext.Commitments
            .AsNoTracking()
            .Where(commitment => commitment.HouseholdId == householdId
                && commitment.IsActive
                && commitment.NextDueDate < today
                && (commitment.UserProfileId == null || commitment.UserProfileId == userProfileId))
            .Take(20)
            .ToArrayAsync(cancellationToken);
        var candidates = new List<JudgementCandidate>();

        foreach (var commitment in overdue)
        {
            var windowStart = commitment.NextDueDate.AddDays(-3);
            var windowEnd = commitment.NextDueDate.AddDays(5);
            var tolerance = decimal.Round(commitment.Amount * 0.10m, 2);
            var matched = await dbContext.Transactions.AnyAsync(
                transaction => transaction.HouseholdId == commitment.HouseholdId
                    && transaction.DeletedAt == null
                    && transaction.CategoryId == commitment.CategoryId
                    && transaction.Type == commitment.TransactionType
                    && transaction.TransactionDate >= windowStart
                    && transaction.TransactionDate <= windowEnd
                    && transaction.Amount >= commitment.Amount - tolerance
                    && transaction.Amount <= commitment.Amount + tolerance,
                cancellationToken);
            if (matched)
            {
                continue;
            }

            var daysOverdue = today.DayNumber - commitment.NextDueDate.DayNumber;
            candidates.Add(Candidate(
                "COMMITMENT_MISSED",
                Key("commitment", commitment.Id.ToString("N")),
                householdId,
                commitment.UserProfileId,
                period,
                JudgementSeverity.Warning,
                SpendingJudgment.NeedsAttention,
                "Commitment due",
                commitment.Name,
                $"{commitment.Name} was due {daysOverdue} day{(daysOverdue == 1 ? "" : "s")} ago.",
                new { commitmentId = commitment.Id, commitment.Name, commitment.Amount, commitment.NextDueDate, daysOverdue, commitment.TransactionType }));
        }

        return candidates;
    }

    private static JudgementCandidate Candidate(
        string ruleCode,
        string deduplicationKey,
        Guid householdId,
        Guid? userProfileId,
        DateOnly period,
        JudgementSeverity severity,
        SpendingJudgment tone,
        string title,
        string value,
        string message,
        object inputs) =>
        new(
            ruleCode,
            deduplicationKey,
            householdId,
            userProfileId,
            period,
            severity,
            tone,
            title,
            value,
            message,
            JsonSerializer.Serialize(inputs, JsonOptions));

    private static bool IsUniqueViolation(DbUpdateException ex) =>
        ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };

    private static string Key(string prefix, string value)
    {
        var normalized = value.Trim().ToLowerInvariant();
        return $"{prefix}:{normalized}"[..Math.Min(128, prefix.Length + 1 + normalized.Length)];
    }

    private static JudgementModel Map(Judgement judgement, DateTimeOffset? dismissedAt = null) =>
        new(
            judgement.Id,
            judgement.RuleCode,
            judgement.SubjectType,
            judgement.SubjectId,
            judgement.HouseholdId,
            judgement.UserProfileId,
            judgement.Period,
            judgement.Severity,
            judgement.Tone,
            judgement.Title,
            judgement.Value,
            judgement.Message,
            judgement.InputsJson,
            judgement.CreatedAt,
            dismissedAt ?? judgement.DismissedAt);

    private sealed record JudgementCandidate(
        string RuleCode,
        string DeduplicationKey,
        Guid HouseholdId,
        Guid? UserProfileId,
        DateOnly Period,
        JudgementSeverity Severity,
        SpendingJudgment Tone,
        string Title,
        string Value,
        string Message,
        string InputsJson)
    {
        public Judgement ToEntity(DateTimeOffset now) =>
            new()
            {
                RuleCode = RuleCode,
                DeduplicationKey = DeduplicationKey,
                SubjectType = UserProfileId is null
                    ? JudgementSubjectType.Household
                    : JudgementSubjectType.UserProfile,
                SubjectId = UserProfileId ?? HouseholdId,
                HouseholdId = HouseholdId,
                UserProfileId = UserProfileId,
                Period = Period,
                Severity = Severity,
                Tone = Tone,
                Title = Title,
                Value = Value,
                Message = Message,
                InputsJson = InputsJson,
                CreatedAt = now
            };
    }
}
