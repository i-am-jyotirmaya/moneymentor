using MoneyMentor.Application.Goals;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Application.Tests.Goals;

public sealed class GoalPlanDeterministicCalculatorTests
{
    private static readonly DateOnly Today = new(2026, 7, 26);

    [Fact]
    public void No_preference_returns_three_distinct_authoritative_paces()
    {
        var candidates = GoalPlanDeterministicCalculator.BuildCandidates(
            Today, 120_000m, 20_000m);

        Assert.Collection(
            candidates,
            item =>
            {
                Assert.Equal(GoalPlanPace.Comfortable, item.Pace);
                Assert.Equal(10_000m, item.MonthlyContribution);
            },
            item =>
            {
                Assert.Equal(GoalPlanPace.Balanced, item.Pace);
                Assert.Equal(15_000m, item.MonthlyContribution);
            },
            item =>
            {
                Assert.Equal(GoalPlanPace.Aggressive, item.Pace);
                Assert.Equal(20_000m, item.MonthlyContribution);
            });
    }

    [Fact]
    public void Supplied_target_date_returns_one_plan()
    {
        var candidate = Assert.Single(GoalPlanDeterministicCalculator.BuildCandidates(
            Today,
            120_000m,
            20_000m,
            requestedTargetDate: new DateOnly(2027, 1, 26)));

        Assert.Equal(GoalPlanPace.Custom, candidate.Pace);
        Assert.Equal(20_000m, candidate.MonthlyContribution);
        Assert.Equal(GoalPlanFeasibility.Feasible, candidate.Feasibility);
    }

    [Fact]
    public void Requested_amount_over_capacity_is_not_silently_accepted()
    {
        var candidate = Assert.Single(GoalPlanDeterministicCalculator.BuildCandidates(
            Today,
            120_000m,
            20_000m,
            requestedMonthlyContribution: 30_000m));

        Assert.Equal(GoalPlanFeasibility.NotFeasible, candidate.Feasibility);
    }

    [Fact]
    public void Zero_capacity_does_not_divide_by_zero()
    {
        var candidates = GoalPlanDeterministicCalculator.BuildCandidates(
            Today, 120_000m, 0m);

        Assert.All(candidates, candidate =>
        {
            Assert.Equal(0m, candidate.MonthlyContribution);
            Assert.Equal(GoalPlanFeasibility.NotFeasible, candidate.Feasibility);
        });
    }
}
