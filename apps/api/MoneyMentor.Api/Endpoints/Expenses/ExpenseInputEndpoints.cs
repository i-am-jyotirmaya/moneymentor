using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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

        var authSubject = GetAuthSubject(httpContext.User);
        if (string.IsNullOrWhiteSpace(authSubject))
        {
            return Results.Unauthorized();
        }

        var parser = serviceProvider.GetService<IExpenseInputParser>();
        if (parser is null)
        {
            return Results.Problem(
                title: "Expense input parser is not configured.",
                detail: "The endpoint contract is ready, but an IExpenseInputParser implementation has not been registered yet.",
                statusCode: StatusCodes.Status501NotImplemented);
        }

        var parseRequest = new ExpenseInputParseRequest(
            request.Text.Trim(),
            "local",
            authSubject,
            request.HouseholdId,
            inputMode,
            request.TransactionDate,
            request.CurrencyCode,
            request.Locale);

        var result = await parser.ParseAsync(parseRequest, cancellationToken);

        return Results.Ok(
            new ExpenseInputResponse(
                result.Status,
                result.Intent,
                result.Draft,
                result.AssistantMessage,
                result.Errors));
    }

    private static string? GetAuthSubject(ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
}
