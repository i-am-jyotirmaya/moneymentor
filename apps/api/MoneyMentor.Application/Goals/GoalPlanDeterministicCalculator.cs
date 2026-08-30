using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Goals;

public static class GoalPlanDeterministicCalculator
{
    public static IReadOnlyCollection<GoalPlanCandidate> BuildCandidates(
        DateOnly currentDate,
        decimal remainingAmount,
        decimal safeMonthlyCapacity,
        GoalPlanPace? requestedPace = null,
        DateOnly? requestedTargetDate = null,
        decimal? requestedMonthlyContribution = null)
    {
        var remaining = Math.Max(0m, remainingAmount);
        var capacity = Math.Max(0m, safeMonthlyCapacity);
        if (remaining == 0m)
        {
            return [new GoalPlanCandidate(
                requestedPace ?? GoalPlanPace.Balanced, 0m, currentDate, GoalPlanFeasibility.Feasible)];
        }

        if (requestedMonthlyContribution is not null
            || requestedTargetDate is not null
            || requestedPace is not null)
        {
            var pace = requestedPace ?? GoalPlanPace.Custom;
            var contribution = requestedMonthlyContribution
                ?? (requestedTargetDate is null
                    ? PaceAmount(capacity, pace)
                    : decimal.Round(
                        remaining / MonthsBetween(currentDate, requestedTargetDate.Value), 2));
            return [CreateCandidate(currentDate, remaining, capacity, pace, contribution)];
        }

        return
        [
            CreateCandidate(currentDate, remaining, capacity, GoalPlanPace.Comfortable, capacity * 0.5m),
            CreateCandidate(currentDate, remaining, capacity, GoalPlanPace.Balanced, capacity * 0.75m),
            CreateCandidate(currentDate, remaining, capacity, GoalPlanPace.Aggressive, capacity)
        ];
    }

    private static GoalPlanCandidate CreateCandidate(
        DateOnly currentDate,
        decimal remaining,
        decimal safeCapacity,
        GoalPlanPace pace,
        decimal amount)
    {
        amount = decimal.Round(Math.Max(0m, amount), 2);
        var months = amount <= 0m ? 1200 : Math.Max(1, (int)Math.Ceiling(remaining / amount));
        var feasibility = amount <= 0m
            ? GoalPlanFeasibility.NotFeasible
            : amount <= safeCapacity
                ? GoalPlanFeasibility.Feasible
                : amount <= safeCapacity * 1.15m
                    ? GoalPlanFeasibility.Stretch
                    : GoalPlanFeasibility.NotFeasible;
        return new GoalPlanCandidate(
            pace,
            amount,
            currentDate.AddMonths(Math.Min(months, 1200)),
            feasibility);
    }

    private static decimal PaceAmount(decimal capacity, GoalPlanPace pace) => pace switch
    {
        GoalPlanPace.Comfortable => capacity * 0.5m,
        GoalPlanPace.Balanced => capacity * 0.75m,
        GoalPlanPace.Aggressive => capacity,
        _ => capacity * 0.75m
    };

    private static int MonthsBetween(DateOnly start, DateOnly end) =>
        Math.Max(1, ((end.Year - start.Year) * 12) + end.Month - start.Month);
}
