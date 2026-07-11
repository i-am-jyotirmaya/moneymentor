using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Application.Transactions;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Operations;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class ExternalBetaReadinessTests(MoneyMentorApiFactory factory)
{
    private const string Password = "BetaPassword1";

    [Fact]
    public async Task Health_checks_report_live_and_migrated_postgresql_ready()
    {
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
    }

    [Fact]
    public async Task Rate_limit_returns_problem_details_and_retry_after()
    {
        await using var limitedFactory = new RateLimitedApiFactory(
            factory.ConnectionString,
            factory.Clock,
            factory.EmailSender);
        using var client = limitedFactory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/public/privacy")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/public/privacy")).StatusCode);
        var rejected = await client.GetAsync("/api/public/privacy");
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.True(rejected.Headers.RetryAfter is not null || rejected.Headers.Contains("Retry-After"));
        var problem = await rejected.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(429, problem!["status"]!.GetValue<int>());
        Assert.False(string.IsNullOrWhiteSpace(problem["traceId"]?.GetValue<string>()));
    }

    [Fact]
    public void Production_configuration_rejects_localhost_cors()
    {
        using var invalidFactory = new InvalidProductionApiFactory();
        var exception = Assert.ThrowsAny<Exception>(() => invalidFactory.CreateClient());
        Assert.Contains("CORS", exception.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Parallel_first_logins_provision_one_profile_personal_household_and_membership()
    {
        var email = UniqueEmail("parallel");
        var authUserId = await factory.SeedIdentityUserAsync(email, Password, "Parallel User");
        var clients = Enumerable.Range(0, 8).Select(_ => factory.CreateClient()).ToArray();

        var responses = await Task.WhenAll(clients.Select(client => client.PostAsJsonAsync(
            "/api/auth/login",
            new { email, password = Password })));
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var profiles = await db.UserProfiles
            .Where(profile => profile.AuthProvider == "local" && profile.AuthSubject == authUserId.ToString())
            .ToArrayAsync();
        var profile = Assert.Single(profiles);
        var personalHousehold = Assert.Single(await db.Households
            .Where(household => household.CreatedByUserProfileId == profile.Id
                && household.Kind == HouseholdKind.Personal)
            .ToArrayAsync());
        Assert.Single(await db.HouseholdMembers
            .Where(member => member.HouseholdId == personalHousehold.Id
                && member.UserProfileId == profile.Id
                && member.Role == HouseholdRole.Owner)
            .ToArrayAsync());
    }

    [Fact]
    public async Task Personal_defaults_two_user_visibility_viewer_denial_and_invitation_history_work()
    {
        using var ownerClient = factory.CreateClient();
        using var viewerClient = factory.CreateClient();
        using var outsiderClient = factory.CreateClient();
        var owner = await SignupAsync(ownerClient, UniqueEmail("owner"), "Household Owner");
        var viewerEmail = UniqueEmail("viewer");
        var viewer = await SignupAsync(viewerClient, viewerEmail, "Household Viewer");
        var outsider = await SignupAsync(outsiderClient, UniqueEmail("outsider"), "Outsider");
        Authorize(ownerClient, owner.AccessToken);
        Authorize(viewerClient, viewer.AccessToken);
        Authorize(outsiderClient, outsider.AccessToken);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
            var ownerProfile = await db.UserProfiles.SingleAsync(profile => profile.AuthSubject == owner.UserId);
            ownerProfile.Plan = UserPlan.Premium;
            ownerProfile.DefaultTransactionVisibility = TransactionVisibility.Household;
            await db.SaveChangesAsync();
        }

        var createHousehold = await ownerClient.PostAsJsonAsync(
            "/api/households",
            new { name = "Beta family" });
        createHousehold.EnsureSuccessStatusCode();
        var householdId = (await createHousehold.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();

        var invitationResponse = await ownerClient.PostAsJsonAsync(
            $"/api/households/{householdId}/invitations",
            new { email = viewerEmail, role = "Viewer" });
        invitationResponse.EnsureSuccessStatusCode();
        var expiredInvitationId = (await invitationResponse.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await ownerClient.PostAsJsonAsync(
                $"/api/households/{householdId}/invitations",
                new { email = viewerEmail, role = "Viewer" })).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
            var expiredInvitation = await db.HouseholdInvitations.SingleAsync(
                invitation => invitation.Id == expiredInvitationId);
            expiredInvitation.ExpiresAt = factory.Clock.GetUtcNow().AddSeconds(-1);
            await db.SaveChangesAsync();
        }
        invitationResponse = await ownerClient.PostAsJsonAsync(
            $"/api/households/{householdId}/invitations",
            new { email = viewerEmail, role = "Viewer" });
        invitationResponse.EnsureSuccessStatusCode();
        var invitationId = (await invitationResponse.Content.ReadFromJsonAsync<JsonObject>())!["id"]!.GetValue<Guid>();

        var received = await viewerClient.GetFromJsonAsync<JsonArray>("/api/households/invitations");
        Assert.Contains(received!, item => item!["id"]!.GetValue<Guid>() == invitationId);
        (await viewerClient.PostAsync($"/api/households/invitations/{invitationId}/accept", null))
            .EnsureSuccessStatusCode();

        var capture = await ownerClient.PostAsJsonAsync(
            "/api/assistant/messages",
            new { text = "groceries for 110 from local market", inputMode = "Text", householdId });
        capture.EnsureSuccessStatusCode();
        var captureJson = await capture.Content.ReadFromJsonAsync<JsonObject>();
        var transactionId = captureJson!["transaction"]!["id"]!.GetValue<Guid>();

        var viewerFamilyRead = await viewerClient.GetAsync($"/api/transactions?householdId={householdId}");
        viewerFamilyRead.EnsureSuccessStatusCode();
        var viewerItems = (await viewerFamilyRead.Content.ReadFromJsonAsync<JsonObject>())!["items"]!.AsArray();
        Assert.Contains(viewerItems, item => item!["id"]!.GetValue<Guid>() == transactionId);
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await viewerClient.DeleteAsync($"/api/transactions/{transactionId}")).StatusCode);

        var personalRead = await viewerClient.GetFromJsonAsync<JsonObject>("/api/transactions");
        Assert.DoesNotContain(
            personalRead!["items"]!.AsArray(),
            item => item!["id"]!.GetValue<Guid>() == transactionId);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await outsiderClient.GetAsync($"/api/transactions?householdId={householdId}")).StatusCode);

        await WaitUntilAsync(async () =>
        {
            var sent = await ownerClient.GetFromJsonAsync<JsonArray>(
                $"/api/households/{householdId}/invitations");
            return sent!.Any(item => item!["id"]!.GetValue<Guid>() == invitationId
                && item["deliveryStatus"]!.GetValue<string>() == "Sent");
        });
        Assert.Contains(factory.EmailSender.Messages, message => message.To == viewerEmail);

        var export = await ownerClient.GetFromJsonAsync<JsonObject>("/api/privacy/export");
        Assert.Equal(1, export!["schemaVersion"]!.GetValue<int>());
        Assert.Contains(
            export["transactions"]!.AsArray(),
            item => item!["id"]!.GetValue<Guid>() == transactionId);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
            var viewerProfile = await db.UserProfiles.SingleAsync(profile => profile.AuthSubject == viewer.UserId);
            var membership = await db.HouseholdMembers.SingleAsync(member =>
                member.HouseholdId == householdId && member.UserProfileId == viewerProfile.Id);
            membership.Role = HouseholdRole.Member;
            await db.SaveChangesAsync();
        }

        using var deleteRequest = new HttpRequestMessage(HttpMethod.Delete, "/api/privacy/account")
        {
            Content = JsonContent.Create(new { password = Password, confirmation = "DELETE" })
        };
        Assert.Equal(HttpStatusCode.NoContent, (await ownerClient.SendAsync(deleteRequest)).StatusCode);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
            var anonymized = await db.Transactions.SingleAsync(transaction => transaction.Id == transactionId);
            Assert.Null(anonymized.UserProfileId);
            Assert.Equal(string.Empty, anonymized.SourceText);
            Assert.Null(anonymized.MerchantName);
            Assert.Null(anonymized.Description);
            Assert.DoesNotContain(
                await db.UserProfiles.Select(profile => profile.AuthSubject).ToArrayAsync(),
                subject => subject == owner.UserId);
        }
    }

    [Fact]
    public async Task Profile_timezone_drives_default_date_and_delete_restore_trash()
    {
        using var client = factory.CreateClient();
        var session = await SignupAsync(client, UniqueEmail("timezone"), "Timezone User");
        Authorize(client, session.AccessToken);
        Assert.Equal(
            HttpStatusCode.BadRequest,
            (await client.PatchAsJsonAsync("/api/settings/me", new { plan = "Premium" })).StatusCode);

        var capture = await client.PostAsJsonAsync(
            "/api/assistant/messages",
            new { text = "petrol 250", inputMode = "Text" });
        capture.EnsureSuccessStatusCode();
        var captured = await capture.Content.ReadFromJsonAsync<JsonObject>();
        var transaction = captured!["transaction"]!.AsObject();
        Assert.Equal("2026-07-02", transaction["transactionDate"]!.GetValue<string>());
        var transactionId = transaction["id"]!.GetValue<Guid>();

        var deleted = await client.DeleteAsync($"/api/transactions/{transactionId}");
        deleted.EnsureSuccessStatusCode();
        var trash = await client.GetFromJsonAsync<JsonObject>("/api/transactions/trash");
        Assert.Contains(trash!["items"]!.AsArray(), item => item!["id"]!.GetValue<Guid>() == transactionId);
        (await client.PostAsync($"/api/transactions/{transactionId}/restore", null)).EnsureSuccessStatusCode();
        trash = await client.GetFromJsonAsync<JsonObject>("/api/transactions/trash");
        Assert.DoesNotContain(trash!["items"]!.AsArray(), item => item!["id"]!.GetValue<Guid>() == transactionId);

        (await client.DeleteAsync($"/api/transactions/{transactionId}")).EnsureSuccessStatusCode();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var expiredTrash = await db.Transactions.SingleAsync(item => item.Id == transactionId);
        expiredTrash.PurgeAfter = factory.Clock.GetUtcNow().AddSeconds(-1);
        await db.SaveChangesAsync();
        Assert.Equal(
            1,
            await scope.ServiceProvider.GetRequiredService<ITransactionService>()
                .PurgeDeletedAsync(CancellationToken.None));
        Assert.False(await db.Transactions.AnyAsync(item => item.Id == transactionId));
    }

    [Fact]
    public async Task Refresh_replay_revokes_session_and_logout_invalidates_access_token()
    {
        using var client = factory.CreateClient();
        var signupResponse = await SignupResponseAsync(client, UniqueEmail("refresh"), "Refresh User");
        var oldCookie = ExtractRefreshCookie(signupResponse.Response);

        var refreshResponse = await client.PostAsync("/api/auth/refresh", null);
        refreshResponse.EnsureSuccessStatusCode();
        var refreshed = await ReadSessionAsync(refreshResponse);

        using var replayClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = false
        });
        using var replayRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        replayRequest.Headers.Add("Cookie", oldCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replayClient.SendAsync(replayRequest)).StatusCode);

        Authorize(client, refreshed.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);

        var logoutSignup = await SignupAsync(client, UniqueEmail("logout"), "Logout User");
        Authorize(client, logoutSignup.AccessToken);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Existing_user_is_consent_gated_and_lockout_is_generic()
    {
        using var client = factory.CreateClient();
        var email = UniqueEmail("consent");
        await factory.SeedIdentityUserAsync(email, Password, "Consent User");
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        login.EnsureSuccessStatusCode();
        var session = await ReadSessionAsync(login);
        Assert.True(session.RequiresPrivacyConsent);
        Authorize(client, session.AccessToken);
        Assert.Equal((HttpStatusCode)428, (await client.GetAsync("/api/settings/me")).StatusCode);
        (await client.PostAsJsonAsync(
            "/api/privacy/consents",
            new { policyVersion = "2026-07-03-beta.1", accepted = true }))
            .EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/settings/me")).StatusCode);

        var lockoutEmail = UniqueEmail("lockout");
        await factory.SeedIdentityUserAsync(lockoutEmail, Password, "Lockout User");
        string? firstError = null;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var failed = await client.PostAsJsonAsync(
                "/api/auth/login",
                new { email = lockoutEmail, password = "WrongPassword1" });
            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
            var error = await failed.Content.ReadAsStringAsync();
            firstError ??= error;
            Assert.Equal(firstError, error);
        }
        var locked = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { email = lockoutEmail, password = Password });
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Equal(firstError, await locked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Premium_changes_require_the_audited_operator_command()
    {
        using var client = factory.CreateClient();
        var email = UniqueEmail("entitlement");
        await SignupAsync(client, email, "Entitlement User");

        var exitCode = await OperationsCommand.RunAsync(
            [
                "entitlement",
                "grant",
                "--email", email,
                "--operator", "beta-operator@moneymentor.test",
                "--reason", "Integration test grant"
            ],
            factory.ConnectionString);
        Assert.Equal(0, exitCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var profile = await db.UserProfiles.SingleAsync(item => item.Email == email);
        Assert.Equal(UserPlan.Premium, profile.Plan);
        var change = await db.EntitlementChanges.SingleAsync(item => item.UserProfileId == profile.Id);
        Assert.Equal(UserPlan.Free, change.PreviousPlan);
        Assert.Equal(UserPlan.Premium, change.NewPlan);
        Assert.Equal("beta-operator@moneymentor.test", change.Operator);
        Assert.Equal("Integration test grant", change.Reason);
    }

    private static async Task<TestSession> SignupAsync(HttpClient client, string email, string displayName) =>
        (await SignupResponseAsync(client, email, displayName)).Session;

    private static async Task<(HttpResponseMessage Response, TestSession Session)> SignupResponseAsync(
        HttpClient client,
        string email,
        string displayName)
    {
        var response = await client.PostAsJsonAsync("/api/auth/users", new
        {
            email,
            password = Password,
            displayName,
            privacyPolicyVersion = "2026-07-03-beta.1",
            acceptPrivacyPolicy = true
        });
        response.EnsureSuccessStatusCode();
        return (response, await ReadSessionAsync(response));
    }

    private static async Task<TestSession> ReadSessionAsync(HttpResponseMessage response)
    {
        var json = await response.Content.ReadFromJsonAsync<JsonObject>();
        return new TestSession(
            json!["accessToken"]!.GetValue<string>(),
            json["user"]!["id"]!.GetValue<string>(),
            json["requiresPrivacyConsent"]!.GetValue<bool>());
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private static string ExtractRefreshCookie(HttpResponseMessage response) =>
        response.Headers.GetValues("Set-Cookie")
            .Single(value => value.StartsWith("mm_refresh=", StringComparison.Ordinal))
            .Split(';')[0];

    private static string UniqueEmail(string prefix) =>
        $"{prefix}-{Guid.NewGuid():N}@moneymentor.test";

    private static async Task WaitUntilAsync(Func<Task<bool>> condition)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            if (await condition())
            {
                return;
            }

            await Task.Delay(50);
        }

        Assert.Fail("The expected background operation did not complete in time.");
    }

    private sealed record TestSession(
        string AccessToken,
        string UserId,
        bool RequiresPrivacyConsent);
}
