using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Application.Judgements;

public sealed record JudgementModel(
    Guid Id,
    string RuleCode,
    JudgementSubjectType SubjectType,
    Guid SubjectId,
    Guid HouseholdId,
    Guid? UserProfileId,
    DateOnly Period,
    JudgementSeverity Severity,
    SpendingJudgment Tone,
    string Title,
    string Value,
    string Message,
    string InputsJson,
    DateTimeOffset CreatedAt,
    DateTimeOffset? DismissedAt);

public interface IJudgementService
{
    Task<IReadOnlyCollection<JudgementModel>> EvaluateMonthlyAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        IReadOnlyCollection<TransactionModel> transactions,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<JudgementModel>> ListAsync(
        AppUserContext userContext,
        Guid? householdId,
        DateOnly month,
        CancellationToken cancellationToken);

    Task<bool> DismissAsync(
        AppUserContext userContext,
        Guid judgementId,
        CancellationToken cancellationToken);
}

public static class JudgementModelExtensions
{
    public static DashboardJudgementModel ToDashboardModel(this JudgementModel judgement) =>
        new(
            judgement.Title,
            judgement.Tone,
            judgement.Value,
            judgement.Message)
        {
            Id = judgement.Id,
            RuleCode = judgement.RuleCode,
            Severity = judgement.Severity,
            InputsJson = judgement.InputsJson
        };
}
