using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.JudgementReports;

public sealed class CandidateDetectionOptions
{
    public const string SectionName = "JudgmentCandidates";
    public bool Enabled { get; set; } = true;
    public int AnalysisIntervalHours { get; set; } = 24;
    public decimal MinInterestingness { get; set; } = 0.30m;
    public decimal CategorySpikeRatio { get; set; } = 1.50m;
    public int RepeatedSpendCount { get; set; } = 3;
    public decimal MerchantFrequencyRatio { get; set; } = 1.75m;
    public decimal SubscriptionBurdenShare { get; set; } = 0.25m;
    public decimal DeviationWeight { get; set; } = 0.30m;
    public decimal FrequencyWeight { get; set; } = 0.20m;
    public decimal GoalImpactWeight { get; set; } = 0.25m;
    public decimal SpendShareWeight { get; set; } = 0.15m;
    public decimal RecencyWeight { get; set; } = 0.10m;
    public string DetectorVersion { get; set; } = "v1";
}

public sealed record MerchantFrequencyFact(Guid MerchantId, decimal CurrentSpend,
    decimal WeeklyBaselineSpend, int CurrentCount, decimal WeeklyBaselineCount);

public static class JudgmentCandidateDetector
{
    public static IReadOnlyList<JudgmentCandidate> Detect(
        Guid householdId, Guid? userProfileId, JudgementReportScope scope, DateOnly endExclusive,
        IReadOnlyCollection<DailyFinancialAggregate> facts,
        IReadOnlyCollection<FinancialGoal> goals,
        IReadOnlyCollection<Commitment> commitments,
        IReadOnlySet<Guid> subscriptionCategoryIds,
        IReadOnlyCollection<MerchantFrequencyFact> merchants,
        CandidateDetectionOptions options)
    {
        if (scope == JudgementReportScope.Personal && userProfileId is null)
            throw new ArgumentException("Personal candidates need an owner.", nameof(userProfileId));
        var start = endExclusive.AddDays(-7);
        var baselineStart = start.AddDays(-28);
        var current = facts.Where(x => x.Date >= start && x.Date < endExclusive).ToArray();
        var baseline = facts.Where(x => x.Date >= baselineStart && x.Date < start).ToArray();
        var currentExpense = current.Sum(x => x.Expense);
        var income30 = facts.Where(x => x.Date >= endExclusive.AddDays(-30) && x.Date < endExclusive)
            .Sum(x => x.Income);
        var expense30 = facts.Where(x => x.Date >= endExclusive.AddDays(-30) && x.Date < endExclusive)
            .Sum(x => x.Expense + x.InvestmentAmount);
        var capacity = Math.Max(0m, income30 - expense30);
        var required = goals.Where(x => x.Status == FinancialGoalStatus.Active)
            .Sum(x => RequiredMonthlyContribution(x, endExclusive));
        var goalPressure = required <= 0m ? 0m : Clamp((required - capacity) / required);
        var results = new List<JudgmentCandidate>();

        foreach (var group in current.Where(x => x.CategoryId is not null).GroupBy(x => x.CategoryId!.Value))
        {
            var amount = group.Sum(x => x.Expense);
            if (amount <= 0m) continue;
            var priorWeekly = baseline.Where(x => x.CategoryId == group.Key).Sum(x => x.Expense) / 4m;
            var ratio = priorWeekly <= 0m ? (decimal?)null : amount / priorWeekly;
            var count = group.Sum(x => x.ExpenseTransactionCount);
            var discretionary = group.Sum(x => x.DiscretionarySpend);
            var share = currentExpense <= 0m ? 0m : amount / currentExpense;
            if (ratio >= options.CategorySpikeRatio && count >= 2)
                Add("CATEGORY_SPENDING_SPIKE", "Category", group.Key, amount, priorWeekly, ratio, count,
                    share, goalPressure, ratio.Value, new { categoryId = group.Key, amount, priorWeekly,
                        transactionCount = count, currentExpense, goalPressure });
            if (discretionary > 0m && count >= options.RepeatedSpendCount && share >= 0.10m)
                Add("REPEATED_DISCRETIONARY_SPEND", "Category", group.Key, discretionary, null, null,
                    count, share, goalPressure, (decimal)count / options.RepeatedSpendCount,
                    new { categoryId = group.Key, discretionary, count, share, goalPressure });
            var olderWeek = facts.Where(x => x.CategoryId == group.Key && x.Date >= start.AddDays(-7)
                && x.Date < start).Sum(x => x.Expense);
            if (olderWeek > 0m && count >= 2 && amount / olderWeek >= options.CategorySpikeRatio)
                Add("CATEGORY_ACCELERATION", "Category", group.Key, amount, olderWeek,
                    amount / olderWeek, count, share, goalPressure, amount / olderWeek,
                    new { categoryId = group.Key, recent = amount, preceding = olderWeek });
        }

        foreach (var merchant in merchants.Where(x => x.WeeklyBaselineCount > 0m &&
            x.CurrentCount >= options.RepeatedSpendCount &&
            x.CurrentCount / x.WeeklyBaselineCount >= options.MerchantFrequencyRatio))
        {
            var share = currentExpense <= 0m ? 0m : merchant.CurrentSpend / currentExpense;
            var ratio = merchant.CurrentCount / merchant.WeeklyBaselineCount;
            Add("MERCHANT_FREQUENCY", "Merchant", merchant.MerchantId,
                merchant.CurrentSpend, merchant.WeeklyBaselineSpend, ratio, merchant.CurrentCount,
                share, goalPressure, ratio,
                new { merchant.MerchantId, merchant.CurrentCount, merchant.WeeklyBaselineCount,
                    merchant.CurrentSpend, merchant.WeeklyBaselineSpend });
        }

        var subscriptions = commitments.Where(x => x.IsActive && x.TransactionType == TransactionType.Expense
            && x.CategoryId is Guid categoryId && subscriptionCategoryIds.Contains(categoryId)).ToArray();
        var recurringMonthly = subscriptions
            .Sum(x => x.Cadence switch
            {
                CommitmentCadence.Monthly => x.Amount,
                CommitmentCadence.Quarterly => x.Amount / 3m,
                CommitmentCadence.Annual => x.Amount / 12m,
                _ => 0m
            });
        if (income30 > 0m && recurringMonthly / income30 >= options.SubscriptionBurdenShare)
            Add("SUBSCRIPTION_ACCUMULATION", "Commitments", null, recurringMonthly,
                income30, recurringMonthly / income30, subscriptions.Length,
                recurringMonthly / income30, goalPressure, recurringMonthly / income30,
                new { recurringMonthly, income30, goalPressure });

        if (goalPressure > 0m && income30 > 0m)
            Add("GOAL_FUNDING_PRESSURE", "Goals", null, required, capacity, null, goals.Count,
                goalPressure, goalPressure, 1m + goalPressure,
                new { requiredMonthlyContribution = required, availableMonthlyCapacity = capacity,
                    shortfall = required - capacity, activeGoalIds = goals.Select(x => x.Id).ToArray() });
        return results;

        void Add(string type, string subjectType, Guid? subjectId, decimal currentValue,
            decimal? baselineValue, decimal? deviation, int frequency, decimal spendShare,
            decimal impact, decimal deviationSignal, object evidence)
        {
            var score = Clamp(options.DeviationWeight * Clamp((deviationSignal - 1m) / 2m)
                + options.FrequencyWeight * Clamp(frequency / 5m)
                + options.GoalImpactWeight * Clamp(impact)
                + options.SpendShareWeight * Clamp(spendShare)
                + options.RecencyWeight);
            var weekStart = endExclusive.AddDays(-1);
            weekStart = weekStart.AddDays(-((int)weekStart.DayOfWeek + 6) % 7);
            var subjectKey = subjectId?.ToString("N") ?? subjectType.ToLowerInvariant();
            var identity = $"{householdId:N}:{userProfileId?.ToString("N") ?? "household"}:{type}:{subjectKey}:{weekStart:yyyyMMdd}:{options.DetectorVersion}";
            results.Add(new JudgmentCandidate
            {
                HouseholdId = householdId, UserProfileId = userProfileId, Scope = scope,
                CandidateType = type, SubjectType = subjectType, SubjectId = subjectId,
                SubjectKey = subjectKey,
                DeduplicationKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity))),
                WindowStart = start, WindowEndExclusive = endExclusive,
                CurrentValue = currentValue, BaselineValue = baselineValue, DeviationRatio = deviation,
                Frequency = frequency, InterestingnessScore = score,
                DetectorConfidence = baseline.Length >= 14 ? 0.85m : 0.60m,
                EvidenceJson = JsonSerializer.Serialize(evidence),
                DetectorVersion = options.DetectorVersion,
                CalculationVersion = "v1",
                Status = score >= options.MinInterestingness
                    ? JudgmentCandidateStatus.Queued : JudgmentCandidateStatus.Pending,
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(21)
            });
        }
    }

    private static decimal Clamp(decimal value) => Math.Clamp(value, 0m, 1m);

    private static decimal RequiredMonthlyContribution(FinancialGoal goal, DateOnly date)
    {
        var remaining = Math.Max(0m, goal.TargetAmount - goal.CurrentAmount);
        if (remaining == 0m) return 0m;
        if (goal.TargetDate is not DateOnly deadline)
            return Math.Max(0m, goal.MonthlyTarget ?? 0m);
        var months = Math.Max(1, (int)Math.Ceiling(Math.Max(0, deadline.DayNumber - date.DayNumber) / 30.4375m));
        return decimal.Round(remaining / months, 2, MidpointRounding.AwayFromZero);
    }
}
