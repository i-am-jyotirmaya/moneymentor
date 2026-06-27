using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.AppUsers;
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
            .Produces<IReadOnlyCollection<TransactionModel>>()
            .Produces(StatusCodes.Status401Unauthorized);

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

        return group;
    }

    private static async Task<IResult> ListTransactionsAsync(
        HttpContext httpContext,
        IAppUserProfileService appUserProfileService,
        ITransactionService transactionService,
        Guid? householdId,
        int? limit,
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

        var transactions = await transactionService.ListAsync(
            userContext,
            householdId,
            limit ?? 50,
            cancellationToken);

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

        var transaction = await transactionService.UpdateAsync(
            userContext,
            transactionId,
            new UpdateTransactionCommand(
                request.Amount,
                request.CategoryName,
                request.MerchantName,
                request.Description,
                request.TransactionDate,
                visibility),
            cancellationToken);

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
}
