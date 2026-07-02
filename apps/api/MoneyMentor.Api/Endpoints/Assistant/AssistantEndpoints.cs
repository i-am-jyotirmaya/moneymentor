using MoneyMentor.Api.Endpoints;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Domain.Enums;

namespace MoneyMentor.Api.Endpoints.Assistant;

public static class AssistantEndpoints
{
    public static RouteGroupBuilder MapAssistantEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints
            .MapGroup("/api/assistant")
            .RequireAuthorization()
            .WithTags("Assistant");

        group.MapPost("/messages", SubmitMessageAsync)
            .WithName("SubmitAssistantMessage")
            .Produces<AssistantMessageResponse>()
            .Produces(StatusCodes.Status401Unauthorized)
            .ProducesValidationProblem();

        return group;
    }

    private static async Task<IResult> SubmitMessageAsync(
        AssistantMessageRequest request,
        HttpContext httpContext,
        IAssistantMessageService assistantMessageService,
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
                "Assistant message text is required.");
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

        AssistantMessageResult result;
        try
        {
            result = await assistantMessageService.ProcessAsync(
                new AssistantMessageCommand(
                    request.Text.Trim(),
                    identity.AuthProvider,
                    identity.AuthSubject,
                    request.HouseholdId,
                    inputMode,
                    request.TransactionDate,
                    request.CurrencyCode,
                    request.Locale,
                    identity.Email,
                    identity.DisplayName),
                cancellationToken);
        }
        catch (InvalidOperationException exception)
        {
            return Results.Problem(
                title: "Assistant message could not be processed.",
                detail: exception.Message,
                statusCode: StatusCodes.Status403Forbidden);
        }

        return Results.Ok(new AssistantMessageResponse(
            result.Status,
            result.Intent,
            result.AssistantMessage,
            result.Transaction,
            result.ParsedDebug,
            result.FinanceAnswer,
            result.Errors));
    }
}
