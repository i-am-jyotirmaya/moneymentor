using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MoneyMentor.Application.Households;
using MoneyMentor.Application.Registration;
using MoneyMentor.Infrastructure.Identity;
using MoneyMentor.Infrastructure.Email;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Operations;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class MvpAccessTests(MoneyMentorApiFactory factory)
{
    private const string Password = "MvpPassword1";

    private WebApplicationFactory<Program> Restricted(ITransactionalEmailSender? sender = null, int requestLimit = 10000) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Registration:Mode", "RequestOnly");
            builder.UseSetting("RateLimits:AccessRequestsPerHour", requestLimit.ToString());
            builder.UseSetting("JudgementReports:SchedulerEnabled", "false");
            builder.UseSetting("JudgementReports:CalculationWorkerEnabled", "false");
            builder.UseSetting("JudgementReports:NarrationWorkerEnabled", "false");
            if (sender is not null) builder.ConfigureServices(services =>
            {
                services.RemoveAll<ITransactionalEmailSender>();
                services.AddSingleton(sender);
            });
        });

    [Fact]
    public async Task Requests_are_validated_deduplicated_and_create_no_identity_or_profile()
    {
        await using var app = Restricted();
        using var client = app.CreateClient();
        var email = Email();
        var invalid = await client.PostAsJsonAsync("/api/auth/access-requests", new { name = " ", email = "invalid" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/access-requests",
            new { name = "Tester", email, reason = new string('x', 1001) })).StatusCode);
        var submissions = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ =>
            client.PostAsJsonAsync("/api/auth/access-requests", new { name = " Tester ", email = email.ToUpperInvariant(), reason = " Test the assistant " })));
        Assert.All(submissions, response => Assert.Equal(HttpStatusCode.Accepted, response.StatusCode));
        var request = await FindAsync(app, email);
        Assert.Equal("Tester", request.Name);
        Assert.Equal("Test the assistant", request.Reason);
        using var scope = app.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>();
        Assert.Equal(1, await auth.MvpAccessRequests.CountAsync(item => item.NormalizedEmail == email.ToUpperInvariant()));
        Assert.False(await auth.Users.AnyAsync(item => item.NormalizedEmail == email.ToUpperInvariant()));
        var data = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        Assert.Null(data.Model.FindEntityType(typeof(MvpAccessRequest)));
        Assert.False(await data.UserProfiles.AnyAsync(item => item.Email == email));
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email)).StatusCode);
        Assert.Equal("RequestOnly", (await client.GetFromJsonAsync<JsonObject>("/api/auth/registration"))!["mode"]!.GetValue<string>());
    }

    [Fact]
    public async Task Cli_approval_emails_a_private_link_and_signup_preserves_existing_login_flow()
    {
        var sender = new RecordingEmailSender();
        await using var app = Restricted(sender);
        using var client = app.CreateClient();
        var email = Email();
        var id = await RequestAsync(app, client, email);
        Assert.Equal(0, await OperationsCommand.RunAsync(["access-requests", "list", "--status", "pending"], factory.ConnectionString));
        Assert.Equal(0, await CliAsync(app, sender, "approve", id));
        var message = Assert.Single(sender.Messages);
        Assert.Equal(email, message.To);
        Assert.Contains("seven days", message.TextBody);
        var token = Token(message);
        var request = await FindAsync(app, email);
        Assert.Equal("Sent", request.DeliveryStatus);
        using (var reviewScope = app.Services.CreateScope())
        {
            var approved = await reviewScope.ServiceProvider.GetRequiredService<IMvpAccessService>()
                .ListAsync("approved", CancellationToken.None);
            Assert.Contains(approved, item => item.Id == id && item.DeliveryStatus == "Sent");
        }
        Assert.Equal("test-operator", request.ReviewedBy);
        Assert.Equal(factory.Clock.GetUtcNow().AddDays(7), request.ExpiresAt);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))), request.TokenHash);
        Assert.NotEqual(token, request.TokenHash);
        for (var index = 0; index < 2; index++)
        {
            var validation = await client.PostAsJsonAsync("/api/auth/signup-invitations/validate", new { token });
            Assert.Equal(HttpStatusCode.OK, validation.StatusCode);
            Assert.Equal(email, (await validation.Content.ReadFromJsonAsync<JsonObject>())!["email"]!.GetValue<string>());
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, Email(), token)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await SignupAsync(client, email, token, "weakpassword")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await SignupAsync(client, email, token, acceptPrivacy: false)).StatusCode);
        Assert.Equal("Approved", (await FindAsync(app, email)).Status);
        var signup = await SignupAsync(client, email.ToUpperInvariant(), token);
        Assert.Equal(HttpStatusCode.OK, signup.StatusCode);
        Assert.True(signup.Headers.Contains("Set-Cookie"));
        Assert.Equal("Registered", (await FindAsync(app, email)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email, token)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/auth/signup-invitations/validate", new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password })).StatusCode);
        using var scope = app.Services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>();
        Assert.True((await auth.Users.SingleAsync(item => item.NormalizedEmail == email.ToUpperInvariant())).EmailConfirmed);
        var profile = await scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>().UserProfiles
            .SingleAsync(item => item.Email.ToUpper() == email.ToUpperInvariant());
        Assert.Equal(MoneyMentor.Domain.Enums.UserPlan.Free, profile.Plan);
    }

    [Fact]
    public async Task Expired_replaced_and_rejected_links_cannot_register_and_duplicates_preserve_review()
    {
        var sender = new RecordingEmailSender();
        await using var app = Restricted(sender);
        using var client = app.CreateClient();
        var email = Email();
        var id = await RequestAsync(app, client, email);
        await ReviewAsync(app, id, "approve");
        var original = Token(sender.Messages.Last());
        using (var scope = app.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>().MvpAccessRequests
                .Where(item => item.Id == id).ExecuteUpdateAsync(setters => setters
                    .SetProperty(item => item.ExpiresAt, factory.Clock.GetUtcNow()));
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email, original)).StatusCode);
        await ReviewAsync(app, id, "resend");
        var replacement = Token(sender.Messages.Last());
        Assert.NotEqual(original, replacement);
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email, original)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/signup-invitations/validate", new { token = replacement })).StatusCode);
        await client.PostAsJsonAsync("/api/auth/access-requests", new { name = "Changed", email, reason = "Changed" });
        Assert.Equal("Approved", (await FindAsync(app, email)).Status);
        Assert.Equal("Tester", (await FindAsync(app, email)).Name);
        await ReviewAsync(app, id, "reject");
        Assert.Equal(2, sender.Messages.Count);
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email, replacement)).StatusCode);
        await client.PostAsJsonAsync("/api/auth/access-requests", new { name = "Changed", email });
        Assert.Equal("Rejected", (await FindAsync(app, email)).Status);
        Assert.Equal(1, await CliAsync(app, sender, "resend", id));
    }

    [Fact]
    public async Task Delivery_failure_is_persisted_cli_fails_and_resend_recovers()
    {
        var sender = new SwitchableSender();
        await using var app = Restricted(sender);
        using var client = app.CreateClient();
        var email = Email();
        var id = await RequestAsync(app, client, email);
        Assert.Equal(1, await CliAsync(app, sender, "approve", id));
        var failed = await FindAsync(app, email);
        Assert.Equal("Approved", failed.Status);
        Assert.Equal("Failed", failed.DeliveryStatus);
        Assert.NotNull(failed.LastDeliveryError);
        sender.Fail = false;
        Assert.Equal(0, await CliAsync(app, sender, "resend", id));
        var sent = await FindAsync(app, email);
        Assert.Equal("Sent", sent.DeliveryStatus);
        Assert.NotEqual(failed.TokenHash, sent.TokenHash);
        Assert.NotEqual(failed.DeliveryId, sent.DeliveryId);
        // A command interrupted after saving approval remains explicitly recoverable.
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>().MvpAccessRequests
                .Where(item => item.Id == id).ExecuteUpdateAsync(setters => setters.SetProperty(item => item.DeliveryStatus, "Pending"));
        Assert.Equal(0, await CliAsync(app, sender, "resend", id));
        Assert.Equal("Sent", (await FindAsync(app, email)).DeliveryStatus);
    }

    [Fact]
    public async Task Concurrent_redemption_creates_exactly_one_account()
    {
        var sender = new RecordingEmailSender();
        await using var app = Restricted(sender);
        using var client = app.CreateClient();
        var email = Email();
        var id = await RequestAsync(app, client, email);
        await ReviewAsync(app, id, "approve");
        var token = Token(sender.Messages.Last());
        var responses = await Task.WhenAll(SignupAsync(client, email, token), SignupAsync(client, email, token));
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Forbidden);
        using var scope = app.Services.CreateScope();
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>().Users
            .CountAsync(item => item.NormalizedEmail == email.ToUpperInvariant()));
    }

    [Fact]
    public async Task Existing_users_can_login_and_requesting_does_not_reveal_or_duplicate_their_account()
    {
        var email = Email();
        await factory.SeedIdentityUserAsync(email, Password, "Existing tester");
        await using var app = Restricted();
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password })).StatusCode);
        var existing = await client.PostAsJsonAsync("/api/auth/access-requests", new { name = "Tester", email });
        var fresh = await client.PostAsJsonAsync("/api/auth/access-requests", new { name = "Tester", email = Email() });
        Assert.Equal(HttpStatusCode.Accepted, existing.StatusCode);
        Assert.Equal(await fresh.Content.ReadAsStringAsync(), await existing.Content.ReadAsStringAsync());
        using var scope = app.Services.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>().MvpAccessRequests
            .AnyAsync(item => item.NormalizedEmail == email.ToUpperInvariant()));
    }

    [Fact]
    public async Task Household_invitations_require_separate_approval_and_can_be_accepted_after_signup()
    {
        using var owner = factory.CreateClient();
        var ownerEmail = Email();
        var ownerSession = await (await SignupAsync(owner, ownerEmail)).Content.ReadFromJsonAsync<JsonObject>();
        owner.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ownerSession!["accessToken"]!.GetValue<string>());
        using (var scope = factory.Services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>().UserProfiles
                .Where(item => item.Email == ownerEmail).ExecuteUpdateAsync(setters => setters
                    .SetProperty(item => item.Plan, MoneyMentor.Domain.Enums.UserPlan.Premium));
        }
        var household = await owner.PostAsJsonAsync("/api/households", new { name = "MVP household" });
        household.EnsureSuccessStatusCode();
        var householdId = (await household.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();
        var email = Email();
        var invitation = await owner.PostAsJsonAsync($"/api/households/{householdId}/invitations", new { email, role = "Viewer" });
        invitation.EnsureSuccessStatusCode();
        var invitationId = (await invitation.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();

        var sender = new RecordingEmailSender();
        await using var app = Restricted(sender);
        using var client = app.CreateClient();
        using (var dispatcher = ActivatorUtilities.CreateInstance<InvitationEmailDispatcher>(app.Services))
            await dispatcher.DispatchAvailableAsync(CancellationToken.None);
        var householdEmail = sender.Messages.Single(message => message.To == email);
        Assert.Contains("/request-access", householdEmail.TextBody);
        Assert.DoesNotContain("/signup", householdEmail.TextBody);
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SignupAsync(client, email, invitationId.ToString())).StatusCode);
        var requestId = await RequestAsync(app, client, email);
        await ReviewAsync(app, requestId, "approve");
        var signup = await SignupAsync(client, email, Token(sender.Messages.Last()));
        signup.EnsureSuccessStatusCode();
        var session = await signup.Content.ReadFromJsonAsync<JsonObject>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session!["accessToken"]!.GetValue<string>());
        (await client.PostAsync($"/api/households/invitations/{invitationId}/accept", null)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Request_rate_limit_returns_retry_after()
    {
        await using var app = Restricted(requestLimit: 2);
        using var client = app.CreateClient();
        for (var index = 0; index < 2; index++)
            Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/auth/access-requests", new { name = "Tester", email = Email() })).StatusCode);
        var response = await client.PostAsJsonAsync("/api/auth/access-requests", new { name = "Tester", email = Email() });
        Assert.Equal(HttpStatusCode.TooManyRequests, response.StatusCode);
        Assert.True(response.Headers.Contains("Retry-After"));
    }

    private async Task<int> CliAsync(WebApplicationFactory<Program> app, ITransactionalEmailSender sender, string action, Guid id) =>
        await OperationsCommand.RunAsync(["access-requests", action, "--id", id.ToString(), "--operator", "test-operator"],
            factory.ConnectionString, services =>
            {
                services.RemoveAll<ITransactionalEmailSender>();
                services.AddSingleton(sender);
                services.AddSingleton<TimeProvider>(factory.Clock);
                services.AddSingleton(app.Services.GetRequiredService<IConfiguration>());
            });

    private static Task<HttpResponseMessage> SignupAsync(HttpClient client, string email, string? token = null,
        string password = Password, bool acceptPrivacy = true) =>
        client.PostAsJsonAsync("/api/auth/users", new
        {
            email, password, displayName = "Tester", invitationToken = token,
            privacyPolicyVersion = "2026-07-26-ai-planning.1", acceptPrivacyPolicy = acceptPrivacy
        });

    private static async Task<Guid> RequestAsync(WebApplicationFactory<Program> app, HttpClient client, string email)
    {
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/auth/access-requests",
            new { name = "Tester", email, reason = "Try expense capture" })).StatusCode);
        return (await FindAsync(app, email)).Id;
    }

    private static async Task<MvpAccessRequest> FindAsync(WebApplicationFactory<Program> app, string email)
    {
        using var scope = app.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<MoneyMentorAuthDbContext>().MvpAccessRequests
            .AsNoTracking().SingleAsync(item => item.NormalizedEmail == email.ToUpperInvariant());
    }

    private static async Task ReviewAsync(WebApplicationFactory<Program> app, Guid id, string action)
    {
        using var scope = app.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IMvpAccessService>().ReviewAsync(id, action, "test-operator", CancellationToken.None);
    }

    private static string Token(TransactionalEmailMessage message) =>
        Regex.Match(message.TextBody, @"/signup#token=([A-F0-9]{64})").Groups[1].Value;

    private static string Email() => $"mvp-{Guid.NewGuid():N}@moneymentor.test";

    private sealed class SwitchableSender : ITransactionalEmailSender
    {
        public bool Fail { get; set; } = true;
        public Task<EmailSendResult> SendAsync(TransactionalEmailMessage message, CancellationToken cancellationToken) =>
            Task.FromResult(Fail ? EmailSendResult.Failure("Simulated provider outage.") : EmailSendResult.Success("test-delivery"));
    }
}
