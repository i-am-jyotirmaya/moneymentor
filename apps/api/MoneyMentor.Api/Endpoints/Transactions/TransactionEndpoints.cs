using System.Globalization;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Transactions;

public static class TransactionEndpoints
{
    public static RouteGroupBuilder MapTransactionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/transactions")
            .RequireAuthorization()
            .WithTags("Transactions");

        group.MapGet("", ListTransactionsAsync)
            .WithName("ListTransactions")
            .Produces<TransactionPageModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        group.MapGet("/{transactionId:guid}", GetTransactionAsync)
            .WithName("GetTransaction")
            .Produces<TransactionModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPatch("/{transactionId:guid}", UpdateTransactionAsync)
            .WithName("UpdateTransaction")
            .Produces<TransactionModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .ProducesValidationProblem();

        group.MapDelete("/{transactionId:guid}", DeleteTransactionAsync)
            .WithName("DeleteTransaction")
            .Produces<TransactionModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden);

        group.MapPost("/{transactionId:guid}/restore", RestoreTransactionAsync)
            .WithName("RestoreTransaction")
            .Produces<TransactionModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status403Forbidden);

        group.MapGet("/trash", ListTrashAsync)
            .WithName("ListDeletedTransactions")
            .Produces<TransactionTrashModel>()
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        return group;
    }

    private static async Task<IResult> ListTransactionsAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
        Guid? householdId,
        string? month,
        int? page,
        int? pageSize,
        CancellationToken cancellationToken)
    {
        if (householdId == Guid.Empty)
        {
            return EndpointValidation.ValidationProblem(
                nameof(householdId),
                "HouseholdId must be a non-empty GUID when provided.");
        }

        var requestedPage = page ?? 1;
        if (requestedPage < 1)
        {
            return EndpointValidation.ValidationProblem(nameof(page), "Page must be at least 1.");
        }

        var requestedPageSize = pageSize ?? 10;
        if (requestedPageSize is < 1 or > 100)
        {
            return EndpointValidation.ValidationProblem(
                nameof(pageSize),
                "PageSize must be between 1 and 100.");
        }

        var userContext = await ResolveContextAsync(
            httpContext,
            appUserProfileService,
            cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }


        if (!TryParseMonth(month, userContext.CurrentDate, out var requestedMonth))
        {
            return EndpointValidation.ValidationProblem(
                nameof(month),
                "Month must use YYYY-MM format.");
        }

        TransactionPageModel transactions;
        try
        {
            transactions = await transactionService.ListAsync(
                userContext,
                new TransactionPageQuery(
                    householdId,
                    requestedMonth,
                    requestedPage,
                    requestedPageSize),
                cancellationToken);
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }

        return Results.Ok(transactions);
    }

    private static async Task<IResult> GetTransactionAsync(
        Guid transactionId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
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

        var transaction = await transactionService.GetAsync(
            userContext,
            transactionId,
            cancellationToken);

        return transaction is null ? Results.NotFound() : Results.Ok(transaction);
    }

    private static async Task<IResult> UpdateTransactionAsync(
        Guid transactionId,
        UpdateTransactionRequest request,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
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

        if (!TryParseVisibility(request.Visibility, out var visibility, out var visibilityError))
        {
            return visibilityError!;
        }

        TransactionModel? transaction;
        try
        {
            transaction = await transactionService.UpdateAsync(
                userContext,
                transactionId,
                new UpdateTransactionCommand(
                    request.Amount,
                    request.CategoryName,
                    request.MerchantName,
                    request.Description,
                    request.TransactionDate,
                    visibility)
                {
                    SenderName = request.SenderName,
                    Reason = request.Reason
                },
                cancellationToken);
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }

        return transaction is null ? Results.NotFound() : Results.Ok(transaction);
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

    private static Task<IResult> DeleteTransactionAsync(
        Guid transactionId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
        CancellationToken cancellationToken) =>
        ChangeDeletionStateAsync(
            transactionId,
            restore: false,
            httpContext,
            appUserProfileService,
            transactionService,
            cancellationToken);

    private static Task<IResult> RestoreTransactionAsync(
        Guid transactionId,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
        CancellationToken cancellationToken) =>
        ChangeDeletionStateAsync(
            transactionId,
            restore: true,
            httpContext,
            appUserProfileService,
            transactionService,
            cancellationToken);

    private static async Task<IResult> ChangeDeletionStateAsync(
        Guid transactionId,
        bool restore,
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
        CancellationToken cancellationToken)
    {
        var userContext = await ResolveContextAsync(httpContext, appUserProfileService, cancellationToken);
        if (userContext is null)
        {
            return Results.Unauthorized();
        }

        TransactionModel? transaction;
        try
        {
            transaction = restore
                ? await transactionService.RestoreAsync(userContext, transactionId, cancellationToken)
                : await transactionService.DeleteAsync(userContext, transactionId, cancellationToken);
        }
        catch (HouseholdWriteForbiddenException)
        {
            return Results.Forbid();
        }
        return transaction is null ? Results.NotFound() : Results.Ok(transaction);
    }

    private static async Task<IResult> ListTrashAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
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
            return Results.Ok(await transactionService.ListTrashAsync(
                userContext,
                householdId,
                cancellationToken));
        }
        catch (HouseholdNotFoundException)
        {
            return Results.NotFound();
        }
    }

    private static bool TryParseVisibility(
        string? value,
        out TransactionVisibility? visibility,
        out IResult? error)
    {
        visibility = null;
        error = null;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (Enum.TryParse<TransactionVisibility>(value, ignoreCase: true, out var parsed))
        {
            visibility = parsed;
            return true;
        }

        error = EndpointValidation.ValidationProblem(
            nameof(UpdateTransactionRequest.Visibility),
            "Visibility must be Private or Household.");
        return false;
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
}
