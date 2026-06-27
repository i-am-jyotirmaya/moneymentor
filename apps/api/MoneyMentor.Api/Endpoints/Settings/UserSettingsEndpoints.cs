using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Settings;

public static class UserSettingsEndpoints
{
    public static RouteGroupBuilder MapUserSettingsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/settings")
            .RequireAuthorization()
            .WithTags("Settings");

        group.MapGet("/me", GetSettingsAsync)
            .WithName("GetUserSettings")
            .Produces<UserSettingsModel>()
            .Produces(StatusCodes.Status401Unauthorized);

        group.MapPatch("/me", UpdateSettingsAsync)
            .WithName("UpdateUserSettings")
            .Produces<UserSettingsModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> GetSettingsAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        CancellationToken cancellationToken)
    {
        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        var settings = await appUserProfileService.GetSettingsAsync(identity, cancellationToken);
        return Results.Ok(settings);
    }

    private static async Task<IResult> UpdateSettingsAsync(
        UpdateUserSettingsRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        if (!TryParseOptional<UserPlan>(request.Plan, nameof(request.Plan), out var plan, out var planError))
        {
            return planError!;
        }

        if (!TryParseOptional<TransactionVisibility>(
                request.DefaultTransactionVisibility,
                nameof(request.DefaultTransactionVisibility),
                out var visibility,
                out var visibilityError))
        {
            return visibilityError!;
        }

        var settings = await appUserProfileService.UpdateSettingsAsync(
            identity,
            new UpdateUserSettingsCommand(
                request.CurrencyCode,
                request.TimeZone,
                plan,
                request.RequireMerchantForExpenses,
                visibility),
            cancellationToken);

        return Results.Ok(settings);
    }

    private static bool TryParseOptional<TEnum>(
        string? value,
        string fieldName,
        out TEnum? parsedValue,
        out IResult? error)
        where TEnum : struct
    {
        parsedValue = null;
        error = null;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (Enum.TryParse<TEnum>(value, ignoreCase: true, out var parsed))
        {
            parsedValue = parsed;
            return true;
        }

        error = EndpointValidation.ValidationProblem(
            fieldName,
            $"{fieldName} has an unsupported value.");
        return false;
    }
}
