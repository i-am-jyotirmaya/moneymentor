using System.Globalization;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Dashboard;

namespace MoneyMentor.Api.Endpoints.Dashboard;

public static class DashboardEndpoints
{
    public static RouteGroupBuilder MapDashboardEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/dashboard")
            .RequireAuthorization()
            .WithTags("Dashboard");

        group.MapGet("/monthly", GetMonthlyDashboardAsync)
            .WithName("GetMonthlyDashboard")
            .Produces<MonthlyDashboardModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> GetMonthlyDashboardAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IMonthlyDashboardService dashboardService,
        string? month,
        Guid? householdId,
        CancellationToken cancellationToken)
    {
        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        if (householdId == Guid.Empty)
        {
            return EndpointValidation.ValidationProblem(
                nameof(householdId),
                "HouseholdId must be a non-empty GUID when provided.");
        }

        if (!TryParseMonth(month, out var requestedMonth))
        {
            return EndpointValidation.ValidationProblem(
                nameof(month),
                "Month must use YYYY-MM format.");
        }

        var userContext = await appUserProfileService.ResolveAsync(
            identity,
            cancellationToken);
        var dashboard = await dashboardService.GetMonthlyDashboardAsync(
            userContext,
            new MonthlyDashboardQuery(
                householdId,
                requestedMonth,
                RecentTransactionLimit: 6),
            cancellationToken);

        return Results.Ok(dashboard);
    }

    private static bool TryParseMonth(string? value, out DateOnly month)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            var currentDate = DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
            month = new DateOnly(currentDate.Year, currentDate.Month, 1);
            return true;
        }

        return DateOnly.TryParseExact(
            $"{value.Trim()}-01",
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out month);
    }
}
