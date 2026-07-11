using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Api.Endpoints.Auth;
using MoneyMentor.Api.Endpoints.Privacy;
using MoneyMentor.Application.AppUsers;
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
}
