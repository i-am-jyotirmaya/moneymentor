using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Expenses;

public static class ExpenseInputEndpoints
{
    public static RouteGroupBuilder MapExpenseInputEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/expenses")
            .RequireAuthorization()
            .WithTags("Expenses");

        group.MapPost("/input", SubmitExpenseInputAsync)
            .WithName("SubmitExpenseInput")
            .Produces<ExpenseInputResponse>()
            .ProducesProblem(StatusCodes.Status501NotImplemented)
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> SubmitExpenseInputAsync(
        ExpenseInputRequest request,
        HttpContext httpContext,
        IServiceProvider serviceProvider,
        CancellationToken cancellationToken)
    {
        var validationResult = EndpointValidation.Validate(request);
        if (validationResult is not null)
        {
            return validationResult;
        }

        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.Text),
                "Expense input text is required.");
        }

        if (request.HouseholdId == Guid.Empty)
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.HouseholdId),
                "HouseholdId must be a non-empty GUID when provided.");
        }

        if (!Enum.TryParse<InputMode>(request.InputMode, ignoreCase: true, out var inputMode))
        {
            return EndpointValidation.ValidationProblem(
                nameof(request.InputMode),
                "InputMode must be Text, Voice, or System.");
        }

        var identity = AppUserIdentityFactory.FromPrincipal(httpContext.User);
        if (identity is null)
        {
            return Results.Unauthorized();
        }

        var processor = serviceProvider.GetService<IExpenseInputProcessor>();
        if (processor is null)
        {
            return Results.Problem(
                title: "Expense input processor is not configured.",
                detail: "The endpoint contract is ready, but an IExpenseInputProcessor implementation has not been registered yet.",
                statusCode: StatusCodes.Status501NotImplemented);
        }

        var parseRequest = new ExpenseInputParseRequest(
            request.Text.Trim(),
            identity.AuthProvider,
            identity.AuthSubject,
            request.HouseholdId,
            inputMode,
            request.TransactionDate,
            request.CurrencyCode,
            request.Locale,
            identity.Email,
            identity.DisplayName);

        ExpenseInputProcessResult result;
        try
        {
            result = await processor.ProcessAsync(parseRequest, cancellationToken);
        }
        catch (InvalidOperationException exception)
        {
            return Results.Problem(
                title: "Expense could not be tracked.",
                detail: exception.Message,
                statusCode: StatusCodes.Status403Forbidden);
        }

        return Results.Ok(
            new ExpenseInputResponse(
                result.Status,
                result.Intent,
                result.Transaction,
                result.ParsedDebug,
                result.AssistantMessage,
                result.Errors));
    }
}
