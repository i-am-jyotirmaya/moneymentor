using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Judgements;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Judgements;

public static class JudgementEndpoints
{
    public static RouteGroupBuilder MapJudgementEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/judgements")
            .RequireAuthorization()
            .WithTags("Judgements");

        group.MapGet("", ListAsync)
            .WithName("ListJudgements")
            .Produces<IReadOnlyCollection<JudgementModel>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        group.MapGet("/active", ListActiveAsync)
            .WithName("ListActiveJudgements")
            .Produces<IReadOnlyCollection<JudgementReportObservationModel>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        group.MapPost("/{judgementId:guid}/dismiss", DismissAsync)
            .WithName("DismissJudgement")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/{judgementId:guid}/explanations", ExplainAsync)
            .WithName("ExplainJudgement")
            .Produces(StatusCodes.Status202Accepted)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> ListAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IJudgementService judgementService,
        Guid? householdId,
        string? month,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        if (!TryParseMonth(month, userContext.CurrentDate, out var requestedMonth))
        {
            return EndpointValidation.ValidationProblem(nameof(month), "Month must use YYYY-MM format.");
        }

        try
        {
            return Results.Ok(await judgementService.ListAsync(
                userContext,
                householdId,
                requestedMonth,
                cancellationToken));
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> DismissAsync(
        Guid judgementId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IJudgementService judgementService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        var dismissed = await judgementService.DismissAsync(userContext, judgementId, cancellationToken);
        return dismissed ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> ExplainAsync(
        Guid judgementId,
        JudgmentExplanationRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        [FromServices] IJudgmentFeedbackService feedbackService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Trim().Length is < 5 or > 2000)
            return EndpointValidation.ValidationProblem(nameof(request.Text), "Explanation must be 5 to 2000 characters.");
        if (request.ValidUntil is DateTimeOffset until &&
            (until <= DateTimeOffset.UtcNow || until > DateTimeOffset.UtcNow.AddYears(2)))
            return EndpointValidation.ValidationProblem(nameof(request.ValidUntil), "ValidUntil must be within two years.");
        var feedbackId = await feedbackService.RecordAsync(userContext, judgementId, request, cancellationToken);
        return feedbackId is Guid id ? Results.Accepted(value: new { feedbackId = id }) : Results.NotFound();
    }

    private static async Task<IResult> ListActiveAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IJudgementReportService reportService,
        Guid? householdId,
        string? scope,
        CancellationToken cancellationToken)
    {
        if (!Enum.TryParse(scope ?? nameof(JudgementReportScope.Personal), true, out JudgementReportScope parsedScope)
            || !Enum.IsDefined(parsedScope))
        {
            return EndpointValidation.ValidationProblem(nameof(scope), "Scope must be Personal or Household.");
        }
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            return Results.Ok(await reportService.ListActiveAsync(
                new JudgementReportRequest(userContext, householdId, parsedScope, JudgementReportCadence.Weekly),
                cancellationToken));
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static bool TryParseMonth(string? value, DateOnly currentDate, out DateOnly month)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
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
}
