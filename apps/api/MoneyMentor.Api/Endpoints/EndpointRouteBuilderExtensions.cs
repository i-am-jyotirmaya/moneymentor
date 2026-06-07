using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Api.Endpoints.Expenses;

namespace MoneyMentor.Api.Endpoints;

public static class EndpointRouteBuilderExtensions
{
    public static IEndpointRouteBuilder MapMoneyMentorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapAuthEndpoints();
        endpoints.MapExpenseInputEndpoints();

        return endpoints;
    }
}
