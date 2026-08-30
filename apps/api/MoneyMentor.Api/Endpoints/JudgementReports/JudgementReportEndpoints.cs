using System.Text.RegularExpressions;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.JudgementReports;

public static partial class JudgementReportEndpoints
{
    public static RouteGroupBuilder MapJudgementReportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/judgement-reports")
            .RequireAuthorization()
            .WithTags("Judgement reports");

        group.MapGet("", GetAsync)
            .WithName("GetJudgementReport")
            .Produces<JudgementReportModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        group.MapGet("/history", ListHistoryAsync)
            .WithName("ListJudgementReportHistory")
            .Produces<IReadOnlyCollection<JudgementReportModel>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> GetAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IJudgementReportService reportService,
        Guid? householdId,
        string? scope,
        string? cadence,
        string? period,
        CancellationToken cancellationToken)
    {
        var parsed = Parse(scope, cadence, period);
        if (parsed.Error is not null)
        {
            return parsed.Error;
        }
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var report = await reportService.GetAsync(
                new JudgementReportRequest(context, householdId, parsed.Scope, parsed.Cadence, period),
                cancellationToken);
            return report is null ? Results.NotFound() : Results.Ok(report);
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> ListHistoryAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IJudgementReportService reportService,
        Guid? householdId,
        string? scope,
        string? cadence,
        string? before,
        int limit = 12,
        CancellationToken cancellationToken = default)
    {
        var parsed = Parse(scope, cadence, before);
        if (parsed.Error is not null)
        {
            return parsed.Error;
        }
        if (limit is < 1 or > 24)
        {
            return EndpointValidation.ValidationProblem(nameof(limit), "Limit must be between 1 and 24.");
        }
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var reports = await reportService.ListHistoryAsync(
                new JudgementReportRequest(context, householdId, parsed.Scope, parsed.Cadence),
                before,
                limit,
                cancellationToken);
            return Results.Ok(reports);
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static ParsedRequest Parse(string? scope, string? cadence, string? period)
    {
        if (!Enum.TryParse(scope ?? nameof(JudgementReportScope.Personal), true, out JudgementReportScope parsedScope)
            || !Enum.IsDefined(parsedScope))
        {
            return new(default, default, EndpointValidation.ValidationProblem(
                nameof(scope), "Scope must be Personal or Household."));
        }
        if (!Enum.TryParse(cadence ?? nameof(JudgementReportCadence.Monthly), true, out JudgementReportCadence parsedCadence)
            || !Enum.IsDefined(parsedCadence)
            || parsedCadence == JudgementReportCadence.Quarterly)
        {
            return new(default, default, EndpointValidation.ValidationProblem(
                nameof(cadence), "Cadence must be Weekly or Monthly. Quarterly is not enabled."));
        }
        if (!string.IsNullOrWhiteSpace(period))
        {
            var valid = parsedCadence == JudgementReportCadence.Weekly
                ? IsValidWeeklyPeriod(period)
                : MonthlyPeriod().IsMatch(period);
            if (!valid)
            {
                return new(default, default, EndpointValidation.ValidationProblem(
                    nameof(period), parsedCadence == JudgementReportCadence.Weekly
                        ? "Weekly period must use YYYY-Www format."
                        : "Monthly period must use YYYY-MM format."));
            }
        }
        return new(parsedScope, parsedCadence, null);
    }

    private static bool IsValidWeeklyPeriod(string period)
    {
        if (!WeeklyPeriod().IsMatch(period))
        {
            return false;
        }

        var parts = period.Split("-W", StringSplitOptions.None);
        var year = int.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture);
        var week = int.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture);
        return week <= System.Globalization.ISOWeek.GetWeeksInYear(year);
    }

    private static async Task<AppUserContext?> ResolveContextAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        CancellationToken cancellationToken)
    {
        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        return identity is null
            ? null
            : await appUserProfileService.ResolveAsync(identity, cancellationToken);
    }

    [GeneratedRegex("^[1-9][0-9]{3}-W(0[1-9]|[1-4][0-9]|5[0-3])$")]
    private static partial Regex WeeklyPeriod();

    [GeneratedRegex("^[1-9][0-9]{3}-(0[1-9]|1[0-2])$")]
    private static partial Regex MonthlyPeriod();

    private sealed record ParsedRequest(
        JudgementReportScope Scope,
        JudgementReportCadence Cadence,
        IResult? Error);
}
