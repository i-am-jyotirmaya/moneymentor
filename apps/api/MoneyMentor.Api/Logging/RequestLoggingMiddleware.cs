using System.Diagnostics;

namespace MoneyMentor.Api.Logging;

public sealed class RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        // Use the server's ID rather than trusting a caller-supplied header.
        var requestId = context.TraceIdentifier;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Request-ID"] = requestId;
            return Task.CompletedTask;
        });
        using var scope = logger.BeginScope(new Dictionary<string, object?>
        {
            ["RequestId"] = requestId,
            ["HttpMethod"] = context.Request.Method
        });
        var startedAt = Stopwatch.GetTimestamp();
        var failed = false;
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            failed = true;
            logger.LogError(exception, "HTTP request failed before completion.");
            throw;
        }
        finally
        {
            // Route templates identify the endpoint without logging query strings or route values.
            var route = (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;
            logger.LogInformation(
                "HTTP {HttpMethod} {Route} completed with {StatusCode} in {ElapsedMs} ms.",
                context.Request.Method, route ?? "unmatched",
                failed ? StatusCodes.Status500InternalServerError : context.Response.StatusCode,
                Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds);
        }
    }
}
