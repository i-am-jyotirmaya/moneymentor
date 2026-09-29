using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.JudgementReports;

public sealed class JudgmentCandidateDetectorTests
{
    [Fact]
    public void Detects_a_personal_spike_without_turning_it_into_a_judgment()
    {
        var household = Guid.NewGuid();
        var owner = Guid.NewGuid();
        var category = Guid.NewGuid();
        var end = new DateOnly(2026, 9, 27);
        var facts = Enumerable.Range(1, 5).Select(week => new DailyFinancialAggregate
        {
            HouseholdId = household, UserProfileId = owner, CategoryId = category,
            Date = end.AddDays(-7 - week * 7), Expense = 100,
            DiscretionarySpend = 100, ExpenseTransactionCount = 1, TransactionCount = 1
        }).ToList();
        facts.Add(new DailyFinancialAggregate
        {
            HouseholdId = household, UserProfileId = owner, CategoryId = category,
            Date = end.AddDays(-1), Expense = 500, DiscretionarySpend = 500,
            ExpenseTransactionCount = 3, TransactionCount = 3
        });
        var options = new CandidateDetectionOptions { MinInterestingness = 0.1m };
        var first = JudgmentCandidateDetector.Detect(household, owner, JudgementReportScope.Personal,
            end, facts, [], [], new HashSet<Guid>(), [], options);
        var replay = JudgmentCandidateDetector.Detect(household, owner, JudgementReportScope.Personal,
            end, facts, [], [], new HashSet<Guid>(), [], options);

        var spike = Assert.Single(first, x => x.CandidateType == "CATEGORY_SPENDING_SPIKE");
        Assert.Equal(500m, spike.CurrentValue);
        Assert.Equal(spike.DeduplicationKey,
            Assert.Single(replay, x => x.CandidateType == "CATEGORY_SPENDING_SPIKE").DeduplicationKey);
        Assert.Equal(JudgmentCandidateStatus.Queued, spike.Status);
    }

    [Fact]
    public void Goal_pressure_uses_a_deterministic_monthly_gap()
    {
        var household = Guid.NewGuid();
        var end = new DateOnly(2026, 9, 27);
        var facts = new[] { new DailyFinancialAggregate
        {
            HouseholdId = household, Date = end.AddDays(-1),
            Income = 1000, Expense = 800
        } };
        var goal = new FinancialGoal
        {
            HouseholdId = household, TargetAmount = 2400, CurrentAmount = 0,
            TargetDate = end.AddMonths(3), Status = FinancialGoalStatus.Active
        };
        var candidates = JudgmentCandidateDetector.Detect(household, null, JudgementReportScope.Household,
            end, facts, [goal], [], new HashSet<Guid>(), [], new CandidateDetectionOptions());

        var pressure = Assert.Single(candidates, x => x.CandidateType == "GOAL_FUNDING_PRESSURE");
        Assert.True(pressure.CurrentValue > pressure.BaselineValue);
        Assert.Contains("shortfall", pressure.EvidenceJson);
    }
}
