using System.Globalization;
using System.Diagnostics;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using MoneyMentor.Application.Assistant;
using MoneyMentor.Application.Dashboard;
using MoneyMentor.Application.Finance;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.InputParsing;
using MoneyMentor.Application.Telemetry;
using MoneyMentor.Api.Endpoints;
using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Api.Endpoints.Privacy;
using MoneyMentor.Api.Production;
using MoneyMentor.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
const string WebCorsPolicy = "MoneyMentorWeb";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (builder.Environment.IsDevelopment() && allowedOrigins.Length == 0)
{
    allowedOrigins =
    [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
    ];
}

ValidateProductionConfiguration(builder, allowedOrigins);

builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<MonthlyDashboardBuilder>();
builder.Services.AddScoped<IMonthlyDashboardService, MonthlyDashboardService>();
builder.Services.AddScoped<FinanceQuestionParser>();
builder.Services.AddScoped<IFinanceQuestionService, FinanceQuestionService>();
builder.Services.AddScoped<IFinanceInputClassifier, HeuristicFinanceInputClassifier>();
builder.Services.AddScoped<IAssistantMessageService, AssistantMessageService>();
builder.Services.AddSingleton<IGoalInputDraftStore, InMemoryGoalInputDraftStore>();
builder.Services.AddScoped<IExpenseInputParser, HeuristicExpenseInputParser>();
builder.Services.AddSingleton<IExpenseInputDraftStore, InMemoryExpenseInputDraftStore>();
builder.Services.AddScoped<IExpenseInputProcessor, ExpenseInputProcessor>();
builder.Services.AddScoped<IIncomeInputParser, HeuristicIncomeInputParser>();
builder.Services.AddSingleton<IIncomeInputDraftStore, InMemoryIncomeInputDraftStore>();
builder.Services.AddScoped<IIncomeInputProcessor, IncomeInputProcessor>();
builder.Services.AddMoneyMentorAuth(builder.Configuration);
builder.Services.Configure<ProductOptions>(builder.Configuration.GetSection(ProductOptions.SectionName));
builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = context =>
        context.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? context.HttpContext.TraceIdentifier);
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    foreach (var value in builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [])
    {
        if (IPAddress.TryParse(value, out var address))
        {
            options.KnownProxies.Add(address);
        }
    }
});
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        WebCorsPolicy,
        policy => policy
            .WithOrigins(allowedOrigins)
            .WithHeaders("Authorization", "Content-Type")
            .WithMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
            .WithExposedHeaders("Retry-After", "Content-Disposition")
            .AllowCredentials());
});
var rateLimits = builder.Configuration.GetSection(RateLimitSettings.SectionName).Get<RateLimitSettings>()
    ?? new RateLimitSettings();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        MoneyMentorTelemetry.RateLimitRejections.Add(1);
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        }

        await Results.Problem(
            title: "Too many requests.",
            detail: "Please wait before trying again.",
            statusCode: StatusCodes.Status429TooManyRequests)
            .ExecuteAsync(context.HttpContext);
    };
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        CreateFixedWindowPartition(
            GetRequestPartition(context),
            context.User.Identity?.IsAuthenticated == true
                ? rateLimits.AuthenticatedPerMinute
                : rateLimits.AnonymousPerMinute,
            TimeSpan.FromMinutes(1)));
    options.AddPolicy(RateLimitPolicyNames.Signup, context =>
        CreateFixedWindowPartition(GetClientPartition(context), rateLimits.SignupsPerHour, TimeSpan.FromHours(1)));
    options.AddPolicy(RateLimitPolicyNames.Login, context =>
        CreateFixedWindowPartition(GetClientPartition(context), rateLimits.LoginsPerFiveMinutes, TimeSpan.FromMinutes(5)));
    options.AddPolicy(RateLimitPolicyNames.Session, context =>
        CreateFixedWindowPartition(GetSessionPartition(context), rateLimits.SessionsPerFiveMinutes, TimeSpan.FromMinutes(5)));
    options.AddPolicy(RateLimitPolicyNames.Invitation, context =>
        CreateFixedWindowPartition(GetRequestPartition(context), rateLimits.InvitationsPerHour, TimeSpan.FromHours(1)));
    options.AddPolicy(RateLimitPolicyNames.Privacy, context =>
        CreateFixedWindowPartition(GetRequestPartition(context), rateLimits.PrivacyOperationsPerHour, TimeSpan.FromHours(1)));
});
builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService(
        serviceName: "MoneyMentor.Api",
        serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString()))
    .WithTracing(tracing =>
    {
        tracing
            .AddSource(MoneyMentorTelemetry.SourceName)
            .AddAspNetCoreInstrumentation(options =>
                options.Filter = context => !context.Request.Path.StartsWithSegments("/health"))
            .AddHttpClientInstrumentation();
        if (Uri.TryCreate(otlpEndpoint, UriKind.Absolute, out var endpoint))
        {
            tracing.AddOtlpExporter(options => options.Endpoint = endpoint);
        }
    })
    .WithMetrics(metrics =>
    {
        metrics
            .AddMeter(MoneyMentorTelemetry.SourceName)
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddRuntimeInstrumentation();
        if (Uri.TryCreate(otlpEndpoint, UriKind.Absolute, out var endpoint))
        {
            metrics.AddOtlpExporter(options => options.Endpoint = endpoint);
        }
    });
builder.Logging.AddOpenTelemetry(options =>
{
    options.IncludeFormattedMessage = true;
    options.IncludeScopes = true;
    if (Uri.TryCreate(otlpEndpoint, UriKind.Absolute, out var endpoint))
    {
        options.AddOtlpExporter(exporter => exporter.Endpoint = endpoint);
    }
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseExceptionHandler();
}

app.UseStatusCodePages(async statusCodeContext =>
{
    var response = statusCodeContext.HttpContext.Response;
    await Results.Problem(
        title: ReasonPhrases.GetReasonPhrase(response.StatusCode),
        statusCode: response.StatusCode)
        .ExecuteAsync(statusCodeContext.HttpContext);
});

app.UseForwardedHeaders();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors(WebCorsPolicy);
app.UseAuthentication();
app.UseRateLimiter();
app.UseMiddleware<PrivacyConsentMiddleware>();
app.UseAuthorization();
app.MapMoneyMentorEndpoints();
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("ready")
});

app.Run();

static RateLimitPartition<string> CreateFixedWindowPartition(
    string key,
    int permitLimit,
    TimeSpan window) =>
    RateLimitPartition.GetFixedWindowLimiter(
        key,
        _ => new FixedWindowRateLimiterOptions
        {
            AutoReplenishment = true,
            PermitLimit = permitLimit,
            QueueLimit = 0,
            Window = window
        });

static string GetRequestPartition(HttpContext context) =>
    context.User.FindFirstValue(ClaimTypes.NameIdentifier)
    ?? GetClientPartition(context);

static string GetSessionPartition(HttpContext context) =>
    context.User.FindFirstValue("sid")
    ?? HashRefreshCookie(context)
    ?? GetClientPartition(context);

static string? HashRefreshCookie(HttpContext context)
{
    if (context.Request.Cookies.TryGetValue(AuthCookieOptions.SessionCookieName, out var sessionId)
        && Guid.TryParse(sessionId, out var parsedSessionId))
    {
        return parsedSessionId.ToString("N");
    }

    if (!context.Request.Cookies.TryGetValue(
            AuthCookieOptions.RefreshCookieName,
            out var refreshToken)
        || string.IsNullOrWhiteSpace(refreshToken))
    {
        return null;
    }

    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken)));
}

static string GetClientPartition(HttpContext context) =>
    context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

static void ValidateProductionConfiguration(
    WebApplicationBuilder builder,
    IReadOnlyCollection<string> allowedOrigins)
{
    if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
    {
        return;
    }

    if (allowedOrigins.Count == 0
        || allowedOrigins.Any(origin =>
            !Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps
            || uri.IsLoopback
            || origin.Contains('*', StringComparison.Ordinal)))
    {
        throw new InvalidOperationException("Production CORS origins must be explicit HTTPS origins.");
    }

    if (string.IsNullOrWhiteSpace(builder.Configuration["Product:SupportEmail"])
        || !Uri.TryCreate(builder.Configuration["Product:PublicWebUrl"], UriKind.Absolute, out var publicWebUri)
        || publicWebUri.Scheme != Uri.UriSchemeHttps
        || string.IsNullOrWhiteSpace(builder.Configuration["Resend:ApiKey"])
        || string.IsNullOrWhiteSpace(builder.Configuration["Resend:FromAddress"])
        || string.IsNullOrWhiteSpace(builder.Configuration["Resend:ReplyTo"]))
    {
        throw new InvalidOperationException("Production public URL, support, and Resend settings are required.");
    }

    var signingKey = builder.Configuration["Jwt:SigningKey"];
    if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
    {
        throw new InvalidOperationException("The production JWT signing key must contain at least 32 bytes.");
    }

    if (!builder.Configuration.GetValue("AuthCookie:Secure", true))
    {
        throw new InvalidOperationException("Production auth cookies must be secure.");
    }

    var allowedHosts = builder.Configuration["AllowedHosts"];
    if (string.IsNullOrWhiteSpace(allowedHosts) || allowedHosts == "*")
    {
        throw new InvalidOperationException("Production AllowedHosts must be explicit.");
    }
}

public partial class Program;
