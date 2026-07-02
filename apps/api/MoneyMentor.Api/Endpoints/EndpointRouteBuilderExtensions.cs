using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Api.Endpoints.Assistant;
using MoneyMentor.Api.Endpoints.Dashboard;
using MoneyMentor.Api.Endpoints.Expenses;
using MoneyMentor.Api.Endpoints.Households;
using MoneyMentor.Api.Endpoints.Settings;
using MoneyMentor.Api.Endpoints.Transactions;

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
        endpoints.MapUserSettingsEndpoints();
        endpoints.MapHouseholdEndpoints();

        return endpoints;
    }
}
