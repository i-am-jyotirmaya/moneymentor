using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;

namespace MoneyMentor.Application.Finance;

public enum FinanceQuestionKind
{
    TopSpendingCategory,
    CategorySpendTotal,
    Unknown
}

public sealed record FinanceQuestionRequest(
    string Text,
    Guid? HouseholdId,
    DateOnly? ReferenceDate,
    string? Locale);

public sealed record FinanceQuestionAnswerModel(
    FinanceQuestionKind Kind,
    string Question,
    string Answer,
    string Month,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    string CurrencyCode,
    decimal? Amount,
    string? CategoryName,
    IReadOnlyCollection<CategorySpendSummaryModel> Categories);

public interface IFinanceQuestionService
{
    Task<FinanceQuestionAnswerModel> AnswerAsync(
        AppUserContext userContext,
        FinanceQuestionRequest request,
        CancellationToken cancellationToken);
}
