using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Commitments;
using MoneyMentor.Application.Households;

namespace MoneyMentor.Api.Endpoints.Commitments;

public static class CommitmentEndpoints
{
    public static RouteGroupBuilder MapCommitmentEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/commitments")
            .RequireAuthorization()
            .WithTags("Commitments");

        group.MapGet("", ListAsync)
            .WithName("ListCommitments")
            .Produces<IReadOnlyCollection<CommitmentModel>>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("", CreateAsync)
            .WithName("CreateCommitment")
            .Produces<CommitmentModel>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPatch("/{commitmentId:guid}", UpdateAsync)
            .WithName("UpdateCommitment")
            .Produces<CommitmentModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> ListAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICommitmentService commitmentService,
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
            return Results.Ok(await commitmentService.ListAsync(userContext, householdId, cancellationToken));
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> CreateAsync(
        CreateCommitmentRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICommitmentService commitmentService,
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
            var created = await commitmentService.CreateAsync(
                new CreateCommitmentCommand(
                    userContext,
                    request.HouseholdId,
                    request.Name,
                    request.CategoryName,
                    request.CategoryId,
                    request.GoalId,
                    request.TransactionType,
                    request.Amount,
                    request.Cadence,
                    request.NextDueDate,
                    request.IsShared),
                cancellationToken);
            return Results.Created($"/api/commitments/{created.Id}", created);
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }
        catch (CommitmentValidationException ex)
        {
            return EndpointValidation.ValidationProblem("commitment", ex.Message);
        }
    }

    private static async Task<IResult> UpdateAsync(
        Guid commitmentId,
        UpdateCommitmentRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICommitmentService commitmentService,
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
            var updated = await commitmentService.UpdateAsync(
                userContext,
                commitmentId,
                new UpdateCommitmentCommand(
                    request.Name,
                    request.CategoryName,
                    request.CategoryId,
                    request.GoalId,
                    request.TransactionType,
                    request.Amount,
                    request.Cadence,
                    request.NextDueDate,
                    request.IsActive),
                cancellationToken);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        }
        catch (CommitmentValidationException ex)
        {
            return EndpointValidation.ValidationProblem("commitment", ex.Message);
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
}
