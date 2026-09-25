using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MoneyMentor.Api.Endpoints.Privacy;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Enums;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class PrivacyContextTests
{
    [Fact]
    public async Task Consented_context_is_available_to_downstream_endpoint_in_same_request()
    {
        var service = new ProfileService();
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Path = "/api/categories";
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "test-user")], "test"));
        var invoked = false;
        var middleware = new PrivacyConsentMiddleware(context =>
        {
            invoked = true;
            Assert.Same(service.UserContext, context.Features.Get<AppUserContext>());
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(httpContext, service);

        Assert.True(invoked);
        Assert.Equal(1, service.ResolveCount);
        Assert.Null(new DefaultHttpContext().Features.Get<AppUserContext>());
    }

    private sealed class ProfileService : IAppUserProfileService
    {
        public AppUserContext UserContext { get; } = new(
            Guid.NewGuid(), Guid.NewGuid(), "test@example.com", "Test", "INR",
            "Asia/Kolkata", UserPlan.Free, false, TransactionVisibility.Private)
        {
            HasCurrentPrivacyConsent = true
        };

        public int ResolveCount { get; private set; }

        public Task<AppUserContext> ResolveAsync(AppUserIdentity identity, CancellationToken cancellationToken)
        {
            ResolveCount++;
            return Task.FromResult(UserContext);
        }

        public Task<UserSettingsModel> GetSettingsAsync(AppUserIdentity identity, CancellationToken cancellationToken)
            => throw new NotSupportedException();

        public Task<UserSettingsModel> UpdateSettingsAsync(
            AppUserIdentity identity, UpdateUserSettingsCommand command, CancellationToken cancellationToken)
            => throw new NotSupportedException();
    }
}
