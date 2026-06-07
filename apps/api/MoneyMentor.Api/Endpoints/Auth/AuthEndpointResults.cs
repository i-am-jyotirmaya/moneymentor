namespace MoneyMentor.Api.Endpoints.Auth;

internal static class AuthEndpointResults
{
    public static IResult ToResult<TResponse>(AuthManagerResult<TResponse> result)
    {
        if (result.Succeeded && result.Value is not null)
        {
            return Results.Ok(result.Value);
        }

        return ToErrorResult(result.FailureKind, result.Errors);
    }

    public static IResult ToResult(AuthManagerResult result)
    {
        if (result.Succeeded)
        {
            return Results.NoContent();
        }

        return ToErrorResult(result.FailureKind, result.Errors);
    }

    private static IResult ToErrorResult(
        AuthFailureKind failureKind,
        IReadOnlyCollection<string> errors)
    {
        var response = new AuthErrorResponse(errors);

        return failureKind switch
        {
            AuthFailureKind.Conflict => Results.Conflict(response),
            AuthFailureKind.InvalidCredentials => Results.Json(response, statusCode: StatusCodes.Status401Unauthorized),
            AuthFailureKind.Unauthorized => Results.Json(response, statusCode: StatusCodes.Status401Unauthorized),
            AuthFailureKind.NotFound => Results.NotFound(response),
            _ => Results.BadRequest(response)
        };
    }
}
