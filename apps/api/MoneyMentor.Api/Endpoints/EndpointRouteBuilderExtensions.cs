using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Api.Endpoints.Assistant;
using MoneyMentor.Api.Endpoints.Categories;
using MoneyMentor.Api.Endpoints.Commitments;
using MoneyMentor.Api.Endpoints.Dashboard;
using MoneyMentor.Api.Endpoints.Expenses;
using MoneyMentor.Api.Endpoints.Goals;
using MoneyMentor.Api.Endpoints.Households;
using MoneyMentor.Api.Endpoints.Judgements;
using MoneyMentor.Api.Endpoints.JudgementReports;
using MoneyMentor.Api.Endpoints.Settings;
using MoneyMentor.Api.Endpoints.Transactions;
using MoneyMentor.Api.Endpoints.Privacy;

namespace MoneyMentor.Api.Endpoints;

public static class EndpointRouteBuilderExtensions
{
    public static IEndpointRouteBuilder MapMoneyMentorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapAuthEndpoints();
        endpoints.MapAssistantEndpoints();
        endpoints.MapDashboardEndpoints();
        endpoints.MapExpenseInputEndpoints();
        endpoints.MapTransactionEndpoints();
        endpoints.MapCategoryEndpoints();
        endpoints.MapGoalEndpoints();
        endpoints.MapCommitmentEndpoints();
        endpoints.MapJudgementEndpoints();
        endpoints.MapJudgementReportEndpoints();
        endpoints.MapUserSettingsEndpoints();
        endpoints.MapHouseholdEndpoints();
        endpoints.MapPrivacyEndpoints();

        return endpoints;
    }
}
