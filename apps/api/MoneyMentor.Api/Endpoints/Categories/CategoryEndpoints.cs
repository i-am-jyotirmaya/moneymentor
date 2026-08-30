using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Categories;
using MoneyMentor.Application.Households;

namespace MoneyMentor.Api.Endpoints.Categories;

public static class CategoryEndpoints
{
    public static RouteGroupBuilder MapCategoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/categories")
            .RequireAuthorization()
            .WithTags("Categories");

        group.MapGet("", ListAsync)
            .WithName("ListCategories")
            .Produces<CategoryCatalogModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("", CreateAsync)
            .WithName("CreateCategory")
            .Produces<CategoryModel>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapPatch("/{categoryId:guid}", UpdateAsync)
            .WithName("UpdateCategory")
            .Produces<CategoryModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        group.MapDelete("/{categoryId:guid}", DeleteAsync)
            .WithName("DeleteCategory")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> ListAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICategoryService categoryService,
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
            return Results.Ok(await categoryService.ListAsync(userContext, householdId, cancellationToken));
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static async Task<IResult> CreateAsync(
        CreateCategoryRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICategoryService categoryService,
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
            var created = await categoryService.CreateAsync(
                new CreateCategoryCommand(
                    userContext,
                    request.HouseholdId,
                    request.Name,
                    request.ParentCategoryId,
                    request.Type,
                    request.Classification,
                    request.Icon),
                cancellationToken);
            return Results.Created($"/api/categories/{created.Id}", created);
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }
        catch (CategoryValidationException ex)
        {
            return EndpointValidation.ValidationProblem("category", ex.Message);
        }
    }

    private static async Task<IResult> UpdateAsync(
        Guid categoryId,
        UpdateCategoryRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICategoryService categoryService,
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
            var updated = await categoryService.UpdateAsync(
                userContext,
                categoryId,
                new UpdateCategoryCommand(
                    userContext,
                    request.Name,
                    request.ParentCategoryId,
                    request.Classification,
                    request.Icon,
                    request.IsHidden),
                cancellationToken);
            return updated is null ? Results.NotFound() : Results.Ok(updated);
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }
        catch (CategoryValidationException ex)
        {
            return EndpointValidation.ValidationProblem("category", ex.Message);
        }
    }

    private static async Task<IResult> DeleteAsync(
        Guid categoryId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ICategoryService categoryService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        try
        {
            var deleted = await categoryService.DeleteAsync(userContext, categoryId, cancellationToken);
            return deleted ? Results.NoContent() : Results.NotFound();
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }
        catch (CategoryValidationException ex)
        {
            return EndpointValidation.ValidationProblem("category", ex.Message);
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
