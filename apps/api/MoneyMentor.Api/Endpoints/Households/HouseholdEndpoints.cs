using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Domain.Enums;

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

        group.MapPost("/{householdId:guid}/members", AddHouseholdMemberAsync)
            .WithName("AddHouseholdMember")
            .Produces<HouseholdSummaryModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

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

    private static async Task<IResult> AddHouseholdMemberAsync(
        Guid householdId,
        AddHouseholdMemberRequest request,
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

        if (!Enum.TryParse<HouseholdRole>(request.Role, ignoreCase: true, out var role))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.Role),
                "Role must be Owner, Admin, Member, or Viewer.");
        }

        var household = await householdService.AddMemberAsync(
            new AddHouseholdMemberCommand(
                userContext,
                householdId,
                request.Email,
                role),
            cancellationToken);

        return household is null ? Results.Forbid() : Results.Ok(household);
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
