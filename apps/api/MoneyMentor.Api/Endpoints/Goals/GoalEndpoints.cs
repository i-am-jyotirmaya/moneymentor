using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Households;

namespace MoneyMentor.Api.Endpoints.Goals;

public static class GoalEndpoints
{
    public static RouteGroupBuilder MapGoalEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/goals")
            .RequireAuthorization()
            .WithTags("Goals");

        group.MapGet("", ListAsync)
            .WithName("ListGoals")
            .Produces<IReadOnlyCollection<GoalModel>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/{goalId:guid}", GetDetailAsync)
            .WithName("GetGoal")
            .Produces<GoalDetailModel>()
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("", CreateAsync)
            .WithName("CreateGoal")
            .Produces<GoalModel>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPatch("/{goalId:guid}", UpdateAsync)
            .WithName("UpdateGoal")
            .Produces<GoalModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPost("/{goalId:guid}/contributions", AddContributionAsync)
            .WithName("AddGoalContribution")
            .Produces<GoalContributionModel>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPost("/{goalId:guid}/planning-runs", CreatePlanningRunAsync)
            .WithName("CreateGoalPlanningRun")
            .Produces<GoalPlanningRunModel>(StatusCodes.Status202Accepted)
            .ProducesValidationProblem();

        group.MapGet("/{goalId:guid}/planning-runs/{runId:guid}", GetPlanningRunAsync)
            .WithName("GetGoalPlanningRun")
            .Produces<GoalPlanningRunModel>()
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/{goalId:guid}/plans/{versionId:guid}/customizations", CustomizePlanAsync)
            .WithName("CustomizeGoalPlan")
            .Produces<GoalPlanVersionModel>(StatusCodes.Status201Created)
            .ProducesValidationProblem();

        group.MapPost("/{goalId:guid}/plans/{versionId:guid}/review-runs", CreateReviewRunAsync)
            .WithName("CreateGoalPlanReviewRun")
            .Produces<GoalPlanningRunModel>(StatusCodes.Status202Accepted)
            .ProducesValidationProblem();

        group.MapPost("/{goalId:guid}/plans/{versionId:guid}/activate", ActivatePlanAsync)
            .WithName("ActivateGoalPlan")
            .Produces<GoalPlanVersionModel>()
            .ProducesValidationProblem();

        group.MapGet("/{goalId:guid}/participant-consent", GetParticipantConsentAsync)
            .WithName("GetGoalPlanParticipantConsent")
            .Produces<GoalPlanParticipantConsentModel>()
            .Produces(StatusCodes.Status404NotFound);

        group.MapPut("/{goalId:guid}/participant-consent", PutParticipantConsentAsync)
            .WithName("PutGoalPlanParticipantConsent")
            .Produces<GoalPlanParticipantConsentModel>();

        group.MapDelete("/{goalId:guid}/participant-consent", DeleteParticipantConsentAsync)
            .WithName("DeleteGoalPlanParticipantConsent")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound);

        return group;
    }

    private static async Task<IResult> GetDetailAsync(
        Guid goalId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        var detail = await planningService.GetDetailAsync(context, goalId, cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    private static async Task<IResult> ListAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalService goalService,
        Guid? householdId,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            return Results.Ok(await goalService.ListAsync(userContext, householdId, cancellationToken));
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> CreateAsync(
        CreateGoalRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalService goalService,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var created = await goalService.CreateAsync(
                new CreateGoalCommand(
                    userContext,
                    request.HouseholdId,
                    request.Name,
                    request.GoalType,
                    request.TargetAmount,
                    request.TargetDate,
                    request.MonthlyTarget,
                    request.Priority,
                    request.IsShared),
                cancellationToken);
            return Results.Created($"/api/goals/{created.Id}", created);
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }
        catch (GoalValidationException ex)
        {
            return EndpointValidation.ValidationProblem("goal", ex.Message);
        }
    }

    private static async Task<IResult> UpdateAsync(
        Guid goalId,
        UpdateGoalRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalService goalService,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var updated = await goalService.UpdateAsync(
                userContext,
                goalId,
                new UpdateGoalCommand(
                    request.Name,
                    request.GoalType,
                    request.TargetAmount,
                    request.TargetDate,
                    request.MonthlyTarget,
                    request.Priority,
                    request.Status),
                cancellationToken);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        }
        catch (GoalValidationException ex)
        {
            return EndpointValidation.ValidationProblem("goal", ex.Message);
        }
    }

    private static async Task<IResult> AddContributionAsync(
        Guid goalId,
        CreateGoalContributionRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalService goalService,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var contribution = await goalService.AddContributionAsync(
                new CreateGoalContributionCommand(
                    userContext,
                    goalId,
                    request.Amount,
                    request.ContributedAt,
                    request.Source,
                    request.TransactionId,
                    request.CommitmentId),
                cancellationToken);
            return contribution is null
                ? Results.NotFound()
                : Results.Created($"/api/goals/{goalId}/contributions/{contribution.Id}", contribution);
        }
        catch (GoalValidationException ex)
        {
            return EndpointValidation.ValidationProblem("goal", ex.Message);
        }
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

    private static async Task<IResult> CreatePlanningRunAsync(
        Guid goalId,
        CreateGoalPlanningRunRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var validation = EndpointValidation.Validate(request);
        if (validation is not null)
        {
            return validation;
        }
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        try
        {
            var run = await planningService.CreateRunAsync(
                new CreateGoalPlanningRunCommand(
                    context, goalId, request.Pace, request.TargetDate,
                    request.MonthlyContribution, request.ParticipantUserProfileIds,
                    request.Locale, GetIdempotencyKey(httpContext)),
                cancellationToken);
            return Results.Accepted($"/api/goals/{goalId}/planning-runs/{run.Id}", run);
        }
        catch (Exception exception) when (IsPlanningException(exception))
        {
            return ToPlanningProblem(exception);
        }
    }

    private static async Task<IResult> GetPlanningRunAsync(
        Guid goalId,
        Guid runId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        var run = await planningService.GetRunAsync(context, goalId, runId, cancellationToken);
        return run is null ? Results.NotFound() : Results.Ok(run);
    }

    private static async Task<IResult> CustomizePlanAsync(
        Guid goalId,
        Guid versionId,
        CustomizeGoalPlanRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var validation = EndpointValidation.Validate(request);
        if (validation is not null)
        {
            return validation;
        }
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        try
        {
            var version = await planningService.CustomizeAsync(
                new CustomizeGoalPlanCommand(
                    context, goalId, versionId, request.Pace,
                    request.TargetDate, request.MonthlyContribution, request.Context),
                cancellationToken);
            return version is null
                ? Results.NotFound()
                : Results.Created($"/api/goals/{goalId}", version);
        }
        catch (Exception exception) when (IsPlanningException(exception))
        {
            return ToPlanningProblem(exception);
        }
    }

    private static async Task<IResult> CreateReviewRunAsync(
        Guid goalId,
        Guid versionId,
        ReviewGoalPlanRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        try
        {
            var run = await planningService.CreateReviewRunAsync(
                new CreateGoalPlanReviewRunCommand(
                    context, goalId, versionId, request.Locale, GetIdempotencyKey(httpContext)),
                cancellationToken);
            return Results.Accepted($"/api/goals/{goalId}/planning-runs/{run.Id}", run);
        }
        catch (Exception exception) when (IsPlanningException(exception))
        {
            return ToPlanningProblem(exception);
        }
    }

    private static async Task<IResult> ActivatePlanAsync(
        Guid goalId,
        Guid versionId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        try
        {
            var version = await planningService.ActivateAsync(
                context, goalId, versionId, GetIdempotencyKey(httpContext), cancellationToken);
            return version is null ? Results.NotFound() : Results.Ok(version);
        }
        catch (Exception exception) when (IsPlanningException(exception))
        {
            return ToPlanningProblem(exception);
        }
    }

    private static async Task<IResult> GetParticipantConsentAsync(
        Guid goalId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        var consent = await planningService.GetConsentAsync(context, goalId, cancellationToken);
        return consent is null ? Results.NotFound() : Results.Ok(consent);
    }

    private static async Task<IResult> PutParticipantConsentAsync(
        Guid goalId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        try
        {
            return Results.Ok(await planningService.ConsentAsync(context, goalId, cancellationToken));
        }
        catch (Exception exception) when (IsPlanningException(exception))
        {
            return ToPlanningProblem(exception);
        }
    }

    private static async Task<IResult> DeleteParticipantConsentAsync(
        Guid goalId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IGoalPlanningService planningService,
        CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (context is null)
        {
            return Results.Unauthorized();
        }
        return await planningService.RevokeConsentAsync(context, goalId, cancellationToken)
            ? Results.NoContent()
            : Results.NotFound();
    }

    private static string GetIdempotencyKey(HttpContext context) =>
        context.Request.Headers["Idempotency-Key"].FirstOrDefault() ?? string.Empty;

    private static bool IsPlanningException(Exception exception) =>
        exception is GoalPlanningValidationException
            or GoalPlanningForbiddenException
            or GoalPlanningConsentException
            or GoalPlanningRateLimitException
            or HouseholdNotFoundException
            or HouseholdWriteForbiddenException;

    private static IResult ToPlanningProblem(Exception exception)
    {
        var (status, title, type) = exception switch
        {
            GoalPlanningForbiddenException or HouseholdWriteForbiddenException =>
                (StatusCodes.Status403Forbidden, "Goal planning is forbidden", "goal_planning_forbidden"),
            GoalPlanningConsentException =>
                (StatusCodes.Status409Conflict, "Goal planning consent is required", "goal_planning_consent_required"),
            GoalPlanningRateLimitException =>
                (StatusCodes.Status429TooManyRequests, "Too many goal planning requests", "goal_planning_rate_limited"),
            HouseholdNotFoundException =>
                (StatusCodes.Status404NotFound, "Goal was not found", "goal_not_found"),
            _ =>
                (StatusCodes.Status400BadRequest, "Goal planning request is invalid", "goal_planning_validation")
        };
        return Results.Problem(
            statusCode: status,
            title: title,
            detail: exception.Message,
            extensions: new Dictionary<string, object?> { ["code"] = type });
    }
}
