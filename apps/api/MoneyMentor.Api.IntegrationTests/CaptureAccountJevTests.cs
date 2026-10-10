using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Diagnostics.Metrics;
using System.Collections.Concurrent;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using MoneyMentor.Api.Endpoints.Assistant;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.Jev;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Jev;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

[Collection(PostgreSqlApiCollection.Name)]
public sealed class CaptureAccountJevTests(MoneyMentorApiFactory factory)
{
    [Theory]
    [InlineData("success", 1, "Groceries", "jev_selected", "success")]
    [InlineData("jev-fallback", 1, "Miscellaneous / Uncategorized", "jev_selected", "success")]
    [InlineData("no-consent", 0, null, null, null)]
    [InlineData("no-key", 0, "Miscellaneous / Uncategorized", "unconfigured_fallback", null)]
    [InlineData("http-error", 1, "Miscellaneous / Uncategorized", "provider_error_fallback", "http_429")]
    [InlineData("invalid-choice", 1, "Miscellaneous / Uncategorized", "invalid_choice_fallback", "success")]
    public async Task Message_API_preserves_Kotak_upi_card_and_records_actual_Jev_attempts(
        string scenario, int expectedCalls, string? expectedCategory, string? categoryOutcome, string? providerOutcome)
    {
        var ct = TestContext.Current.CancellationToken;
        var handler = new RecordingJevHandler(scenario);
        using var logs = new StructuredLoggingTests.CaptureProvider();
        using var app = factory.WithWebHostBuilder(builder =>
        {
            // Reproduce Compose's empty alias alongside a valid hierarchical key.
            builder.UseSetting("JEV_API_KEY", "");
            builder.UseSetting("Jev:ApiKey", scenario == "no-key" ? "" : "test-key");
            builder.ConfigureLogging(logging => logging.AddProvider(logs));
            builder.ConfigureServices(services => services.AddHttpClient<IJevClient, JevClient>()
                .ConfigurePrimaryHttpMessageHandler(() => handler));
        });
        const string password = "CapturePassword1";
        var email = $"capture-{Guid.NewGuid():N}@moneymentor.test";
        var authId = await factory.SeedIdentityUserAsync(email, password, "Capture tester");
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var context = await scope.ServiceProvider.GetRequiredService<IAppUserProfileService>()
            .ResolveAsync(new("local", authId.ToString(), email, "Capture tester"), ct);
        var accounts = scope.ServiceProvider.GetRequiredService<IFinancialAccountService>();
        var bank = await accounts.SaveAsync(context, null,
            new(context.PersonalHouseholdId, "Kotak", FinancialAccountType.BankAccount, "Kotak", null, ["kotak"]), ct);
        var card = await accounts.SaveAsync(context, null,
            new(context.PersonalHouseholdId, "Kotak Upi Card", FinancialAccountType.CreditCard, "Kotak", null, []), ct);
        if (scenario != "no-consent")
        {
            db.PrivacyConsents.Add(new PrivacyConsent { UserProfileId = context.UserProfileId, PolicyVersion = PrivacyPolicy.CurrentVersion });
            await db.SaveChangesAsync(ct);
        }
        using var client = app.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password }, ct);
        login.EnsureSuccessStatusCode();
        using var session = JsonDocument.Parse(await login.Content.ReadAsStringAsync(ct));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", session.RootElement.GetProperty("accessToken").GetString());

        var measurements = new ConcurrentQueue<(string Name, long Count, string? Outcome)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meter) =>
        {
            if (instrument.Name is "spndrr.jev.requests" or "spndrr.capture.categorization") meter.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((instrument, count, tags, _) =>
        {
            string? outcome = null, operation = null;
            foreach (var tag in tags)
            {
                if (tag.Key == "outcome") outcome = tag.Value?.ToString();
                if (tag.Key == "operation") operation = tag.Value?.ToString();
            }
            if (instrument.Name != "spndrr.jev.requests" || operation == "categorization")
                measurements.Enqueue((instrument.Name, count, outcome));
        });
        listener.Start();
        const string source = "bought potatoes for rs 40 using kotak upi";
        var response = await client.PostAsJsonAsync("/api/assistant/messages",
            new { text = source, householdId = context.PersonalHouseholdId, inputMode = "Text" }, ct);
        Assert.Equal(expectedCalls, handler.Calls);
        Assert.Equal(expectedCalls, measurements.Where(m => m.Name == "spndrr.jev.requests").Sum(m => m.Count));
        var requestId = Assert.Single(response.Headers.GetValues("X-Request-ID"));
        var records = logs.Read().Where(r => r.GetProperty("RequestId").GetString() == requestId).ToArray();
        var properties = records.Select(r => r.GetProperty("Properties")).ToArray();
        if (scenario == "no-consent")
        {
            Assert.Equal((HttpStatusCode)428, response.StatusCode);
            Assert.Contains(properties, p => p.TryGetProperty("PrivacyGateReason", out var reason) && reason.GetString() == "current_consent_missing");
            Assert.Empty(measurements);
            Assert.False(await db.Transactions.AnyAsync(t => t.UserProfileId == context.UserProfileId, ct));
            return;
        }
        response.EnsureSuccessStatusCode();
        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        jsonOptions.Converters.Add(new JsonStringEnumConverter());
        var result = await response.Content.ReadFromJsonAsync<AssistantMessageResponse>(jsonOptions, ct);
        Assert.NotNull(result?.Transaction);
        var saved = result.Transaction;
        Assert.Equal(40m, saved.Amount); Assert.Equal(TransactionKind.Purchase, saved.Kind);
        Assert.Equal(card.Id, saved.AccountId); Assert.Equal("Kotak Upi Card", saved.AccountName);
        Assert.NotEqual(bank.Id, saved.AccountId);
        Assert.Equal(PaymentChannel.UPI, saved.PaymentChannel); Assert.Equal("potatoes", saved.Description);
        Assert.Equal(source, saved.SourceText); Assert.Equal(expectedCategory, saved.CategoryName);
        Assert.Equal($"Tracked ₹40 for potatoes under {expectedCategory} using Kotak Upi Card (UPI).", result.AssistantMessage);
        db.ChangeTracker.Clear();
        var persisted = await db.Transactions.AsNoTracking().SingleAsync(x => x.Id == saved.Id, ct);
        Assert.Equal(card.Id, persisted.AccountId); Assert.Equal(PaymentChannel.UPI, persisted.PaymentChannel);
        Assert.Equal("potatoes", persisted.Description);
        Assert.Contains(properties, p => p.TryGetProperty("CaptureRoute", out var route) && route.GetString() == "expense");
        Assert.Contains(properties, p => p.TryGetProperty("AccountResolutionOutcome", out var outcome) && outcome.GetString() == "card_descriptor_matched"
            && p.GetProperty("AccountType").GetString() == "CreditCard");
        Assert.Contains(properties, p => p.TryGetProperty("CategorizationOutcome", out var outcome) && outcome.GetString() == categoryOutcome);
        Assert.Contains(measurements, m => m.Name == "spndrr.capture.categorization" && m.Outcome == categoryOutcome && m.Count == 1);
        // New diagnostics carry only bounded metadata, correlated to this request.
        var diagnosticCategories = new[] { "AssistantEndpoints", "AssistantMessageService", "PostgresFinancialAccountService", "PostgresFinancialEventService", "JevTransactionCategorizer", "JevClient" };
        foreach (var record in records.Where(r => diagnosticCategories.Any(c => r.GetProperty("SourceContext").GetString()!.EndsWith(c))))
        {
            var raw = record.GetRawText();
            Assert.DoesNotContain(source, raw); Assert.DoesNotContain("test-key", raw);
            Assert.DoesNotContain("Kotak", raw, StringComparison.OrdinalIgnoreCase);
        }
        if (expectedCalls > 0)
        {
            Assert.Equal("/v1/systemone", handler.Path); Assert.Equal("Bearer test-key", handler.Authorization);
            Assert.Contains(records, r => r.GetProperty("SourceContext").GetString()!.EndsWith("JevClient")
                && r.GetProperty("Message").GetString()!.Contains("started"));
            Assert.Contains(properties, p => p.TryGetProperty("JevOutcome", out var outcome) && outcome.GetString() == providerOutcome
                && p.GetProperty("JevOperation").GetString() == "categorization");
            Assert.Contains(measurements, m => m.Name == "spndrr.jev.requests" && m.Outcome == providerOutcome && m.Count == 1);
            using var body = JsonDocument.Parse(handler.Body!);
            Assert.Equal("potatoes", body.RootElement.GetProperty("state").GetProperty("description").GetString());
            Assert.Equal(source, body.RootElement.GetProperty("state").GetProperty("sourceText").GetString());
            Assert.Equal("choice", body.RootElement.GetProperty("questions").GetProperty("category").GetProperty("type").GetString());
        }
        if (scenario == "success")
        {
            Assert.Equal("Food & Groceries", saved.ParentCategoryName);
            Assert.Equal(CategoryClassification.Essential, saved.CategoryClassification);
        }
    }

    private sealed class RecordingJevHandler(string scenario) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public string? Body { get; private set; }
        public string? Path { get; private set; }
        public string? Authorization { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++; Path = request.RequestUri?.AbsolutePath; Authorization = request.Headers.Authorization?.ToString();
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(scenario == "http-error" ? HttpStatusCode.TooManyRequests : HttpStatusCode.OK)
            {
                Content = new StringContent(JsonSerializer.Serialize(new
                {
                    model = "jev-latest",
                    answers = new { category = new { type = "choice", choice = scenario switch
                    {
                        "invalid-choice" => "Salary / Wages",
                        "jev-fallback" => "Miscellaneous / Uncategorized",
                        _ => "Groceries"
                    }, confidence = 0.95 } }
                }))
            };
        }
    }
}
