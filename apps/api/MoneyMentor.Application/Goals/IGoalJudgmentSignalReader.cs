using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Goals;

// A future Goals Engine can consume these trusted facts and reviewed judgment
// decisions without treating AI output as the source of financial arithmetic.
public interface IGoalJudgmentSignalReader
{
    Task<GoalJudgmentSignalSnapshot> ReadAsync(AppUserContext userContext, Guid goalId,
        CancellationToken cancellationToken);
}

public sealed record GoalJudgmentSignalSnapshot(Guid GoalId, DateOnly AsOfDate,
    JudgementReportScope Scope, IReadOnlyCollection<GoalJudgmentWindow> Windows,
    IReadOnlyCollection<GoalJudgmentSignal> Judgments);

public sealed record GoalJudgmentWindow(int Days, decimal Income, decimal Expense,
    decimal EssentialSpend, decimal DiscretionarySpend, decimal DebtSpend,
    decimal InvestmentAmount, int TransactionCount, string CalculationVersion);

public sealed record GoalJudgmentSignal(Guid CandidateId, string CandidateType,
    JudgmentDecisionAction Action, decimal Importance, decimal Confidence,
    DateOnly WindowStart, DateOnly WindowEndExclusive, decimal? CurrentValue,
    decimal? BaselineValue, string EvidenceJson, string? Reason);
