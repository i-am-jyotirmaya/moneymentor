using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Api.Endpoints.Categories;
using MoneyMentor.Api.Endpoints.Commitments;
using MoneyMentor.Api.Endpoints.Goals;
using MoneyMentor.Api.Endpoints.Judgements;
using MoneyMentor.Api.Endpoints.JudgementReports;
using MoneyMentor.Api.Endpoints.Privacy;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.Categories;
using MoneyMentor.Application.Commitments;
using MoneyMentor.Application.Goals;
using MoneyMentor.Application.Judgements;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Application.Privacy;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class EndpointBindingTests
{
    [Fact]
    public void Privacy_endpoints_build_with_an_explicit_delete_request_body()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddScoped<IAppUserProfileService>(_ => null!);
        builder.Services.AddScoped<IPrivacyService>(_ => null!);
        builder.Services.Configure<ProductOptions>(_ => { });
        builder.Services.Configure<AuthCookieOptions>(_ => { });

        using var app = builder.Build();
        app.MapPrivacyEndpoints();

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .ToArray();

        Assert.Contains(endpoints, endpoint =>
            endpoint.RoutePattern.RawText == "/api/privacy/account"
            && endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("DELETE") == true);
    }

    [Fact]
    public void Spendrr_planning_endpoints_build_with_request_bodies()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddAuthorization();
        builder.Services.AddScoped<IAppUserProfileService>(_ => null!);
        builder.Services.AddScoped<ICategoryService>(_ => null!);
        builder.Services.AddScoped<IGoalService>(_ => null!);
        builder.Services.AddScoped<IGoalPlanningService>(_ => null!);
        builder.Services.AddScoped<ICommitmentService>(_ => null!);
        builder.Services.AddScoped<IJudgementService>(_ => null!);
        builder.Services.AddScoped<IJudgementReportService>(_ => null!);

        using var app = builder.Build();
        app.MapCategoryEndpoints();
        app.MapGoalEndpoints();
        app.MapCommitmentEndpoints();
        app.MapJudgementEndpoints();
        app.MapJudgementReportEndpoints();

        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .ToArray();

        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/categories"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/goals/{goalId:guid}/contributions"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/goals/{goalId:guid}/planning-runs"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/goals/{goalId:guid}/plans/{versionId:guid}/activate"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/goals/{goalId:guid}/participant-consent"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/commitments/{commitmentId:guid}"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/judgements/{judgementId:guid}/dismiss"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/judgements/active"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/judgement-reports"));
        Assert.Contains(endpoints, endpoint => MatchesRoute(endpoint, "/api/judgement-reports/history"));
    }

    private static bool MatchesRoute(RouteEndpoint endpoint, string expected) =>
        string.Equals(
            endpoint.RoutePattern.RawText?.TrimEnd('/'),
            expected,
            StringComparison.Ordinal);
}
