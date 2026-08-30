using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Api.Production;

namespace MoneyMentor.Api.Endpoints.Households;

public static class HouseholdEndpoints
{
    public static RouteGroupBuilder MapHouseholdEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/households")
            .RequireAuthorization()
            .WithTags("Households");

        group.MapGet("", ListHouseholdsAsync)
            .WithName("ListHouseholds")
            .Produces<HouseholdDashboardModel>()
            .Produces(StatusCodes.Status401Unauthorized);

        group.MapPost("", CreateHouseholdAsync)
            .WithName("CreateHousehold")
            .Produces<HouseholdSummaryModel>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPatch("/{householdId:guid}/settings", UpdateSettingsAsync)
            .WithName("UpdateHouseholdSettings")
            .Produces<HouseholdSummaryModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .ProducesValidationProblem();

        group.MapGet("/invitations", ListPendingInvitationsAsync)
            .WithName("ListPendingHouseholdInvitations")
            .Produces<IReadOnlyCollection<HouseholdInvitationModel>>()
            .Produces(StatusCodes.Status401Unauthorized);

        group.MapPost("/{householdId:guid}/invitations", CreateInvitationAsync)
            .RequireRateLimiting(RateLimitPolicyNames.Invitation)
            .WithName("CreateHouseholdInvitation")
            .Produces<HouseholdInvitationModel>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .ProducesValidationProblem();

        group.MapGet("/{householdId:guid}/invitations", ListSentInvitationsAsync)
            .WithName("ListSentHouseholdInvitations")
            .Produces<IReadOnlyCollection<HouseholdInvitationModel>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/invitations/{invitationId:guid}/accept", AcceptInvitationAsync)
            .WithName("AcceptHouseholdInvitation")
            .Produces<HouseholdInvitationModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status410Gone);

        group.MapPost("/invitations/{invitationId:guid}/decline", DeclineInvitationAsync)
            .WithName("DeclineHouseholdInvitation")
            .Produces<HouseholdInvitationModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict)
            .Produces(StatusCodes.Status410Gone);

        return group;
    }

    private static async Task<IResult> ListHouseholdsAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(
            httpContext,
            appUserProfileService,
            cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        var households = await householdService.ListAsync(userContext, cancellationToken);
        return Results.Ok(households);
    }

    private static async Task<IResult> CreateHouseholdAsync(
        CreateHouseholdRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var userContext = await ResolveContextAsync(
            httpContext,
            appUserProfileService,
            cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        var household = await householdService.CreateFamilyHouseholdAsync(
            new CreateHouseholdCommand(userContext, request.Name),
            cancellationToken);

        return household is null
            ? Results.Forbid()
            : Results.Created($"/api/households/{household.Id}", household);
    }

    private static async Task<IResult> UpdateSettingsAsync(
        Guid householdId,
        UpdateHouseholdSettingsRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
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

        var result = await householdService.UpdateSettingsAsync(
            new UpdateHouseholdSettingsCommand(
                userContext,
                householdId,
                request.CurrencyCode,
                request.TimeZone),
            cancellationToken);

        return result.Status switch
        {
            UpdateHouseholdSettingsStatus.Succeeded => Results.Ok(result.Household),
            UpdateHouseholdSettingsStatus.Forbidden => Results.Forbid(),
            UpdateHouseholdSettingsStatus.NotFound => Results.NotFound(),
            UpdateHouseholdSettingsStatus.CurrencyLocked => Results.Problem(
                title: "Household currency is locked after the first transaction.",
                statusCode: StatusCodes.Status409Conflict),
            UpdateHouseholdSettingsStatus.InvalidCurrency => EndpointValidation.ValidationProblem(
                nameof(request.CurrencyCode),
                "CurrencyCode must be a three-letter ISO currency code."),
            UpdateHouseholdSettingsStatus.InvalidTimeZone => EndpointValidation.ValidationProblem(
                nameof(request.TimeZone),
                "TimeZone must be a valid IANA time-zone identifier."),
            _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError)
        };
    }

    private static async Task<IResult> ListPendingInvitationsAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(
            httpContext,
            appUserProfileService,
            cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        var invitations = await householdService.ListPendingInvitationsAsync(
            userContext,
            cancellationToken);
        return Results.Ok(invitations);
    }

    private static async Task<IResult> ListSentInvitationsAsync(
        Guid householdId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdAccessService householdAccessService,
        IHouseholdService householdService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            await householdAccessService.ResolveAsync(
                userContext,
                householdId,
                requireWrite: false,
                cancellationToken);
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }

        var invitations = await householdService.ListSentInvitationsAsync(
            userContext,
            householdId,
            cancellationToken);
        return invitations is null ? Results.Forbid() : Results.Ok(invitations);
    }

    private static async Task<IResult> CreateInvitationAsync(
        Guid householdId,
        CreateHouseholdInvitationRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var userContext = await ResolveContextAsync(
            httpContext,
            appUserProfileService,
            cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        if (!Enum.TryParse<HouseholdRole>(request.Role, ignoreCase: true, out var role)
            || !HouseholdInvitationPolicy.CanAssignRole(role))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.Role),
                "Role must be Admin, Member, or Viewer.");
        }

        var result = await householdService.InviteMemberAsync(
            new CreateHouseholdInvitationCommand(
                userContext,
                householdId,
                request.Email,
                role),
            cancellationToken);

        return result.Status switch
        {
            HouseholdInvitationResultStatus.Succeeded => Results.Created(
                $"/api/households/invitations/{result.Invitation!.Id}",
                result.Invitation),
            HouseholdInvitationResultStatus.Forbidden => Results.Forbid(),
            HouseholdInvitationResultStatus.NotFound => Results.NotFound(),
            HouseholdInvitationResultStatus.Conflict => Results.Problem(
                title: "The user is already a member or has a pending invitation.",
                statusCode: StatusCodes.Status409Conflict),
            HouseholdInvitationResultStatus.InvalidRole => EndpointValidation.ValidationProblem(
                nameof(request.Role),
                "Role must be Admin, Member, or Viewer."),
            _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError)
        };
    }

    private static Task<IResult> AcceptInvitationAsync(
        Guid invitationId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken) =>
        RespondToInvitationAsync(
            invitationId,
            accept: true,
            httpContext,
            appUserProfileService,
            householdService,
            cancellationToken);

    private static Task<IResult> DeclineInvitationAsync(
        Guid invitationId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken) =>
        RespondToInvitationAsync(
            invitationId,
            accept: false,
            httpContext,
            appUserProfileService,
            householdService,
            cancellationToken);

    private static async Task<IResult> RespondToInvitationAsync(
        Guid invitationId,
        bool accept,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        IHouseholdService householdService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(
            httpContext,
            appUserProfileService,
            cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        var command = new RespondToHouseholdInvitationCommand(userContext, invitationId);
        var result = accept
            ? await householdService.AcceptInvitationAsync(command, cancellationToken)
            : await householdService.DeclineInvitationAsync(command, cancellationToken);

        return result.Status switch
        {
            HouseholdInvitationResultStatus.Succeeded => Results.Ok(result.Invitation),
            HouseholdInvitationResultStatus.NotFound => Results.NotFound(),
            HouseholdInvitationResultStatus.Conflict => Results.Problem(
                title: "The invitation is no longer pending.",
                statusCode: StatusCodes.Status409Conflict),
            HouseholdInvitationResultStatus.Expired => Results.Problem(
                title: "The invitation has expired.",
                statusCode: StatusCodes.Status410Gone),
            HouseholdInvitationResultStatus.Forbidden => Results.Forbid(),
            _ => Results.Problem(statusCode: StatusCodes.Status500InternalServerError)
        };
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
