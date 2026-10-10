using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.FinancialAccounts;
using MoneyMentor.Application.InputParsing;
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
    [InlineData("success", 1, "Groceries")]
    [InlineData("jev-fallback", 1, "Miscellaneous / Uncategorized")]
    [InlineData("no-consent", 0, null)]
    [InlineData("no-key", 0, "Miscellaneous / Uncategorized")]
    [InlineData("http-error", 1, "Miscellaneous / Uncategorized")]
    [InlineData("invalid-choice", 1, "Miscellaneous / Uncategorized")]
    public async Task Exact_potatoes_input_resolves_Kotak_UPI_and_calls_Jev_only_when_permitted(
        string scenario, int expectedCalls, string? expectedCategory)
    {
        var ct = TestContext.Current.CancellationToken;
        var handler = new RecordingJevHandler(scenario);
        using var http = new HttpClient(handler) { BaseAddress = new Uri("https://api.typesafe.ai/") };
        using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IJevClient>();
            services.AddSingleton<IJevClient>(new JevClient(http, Options.Create(new JevOptions
            {
                ApiKey = scenario == "no-key" ? null : "test-key"
            })));
        }));
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MoneyMentorDbContext>();
        var subject = Guid.NewGuid().ToString();
        var context = await scope.ServiceProvider.GetRequiredService<IAppUserProfileService>()
            .ResolveAsync(new("test", subject, "capture@example.test", "Capture tester"), ct);
        var account = await scope.ServiceProvider.GetRequiredService<IFinancialAccountService>()
            .SaveAsync(context, null, new(context.PersonalHouseholdId, "Kotak", FinancialAccountType.BankAccount,
                "Kotak", null, ["kotak"]), ct);
        if (scenario != "no-consent")
        {
            db.PrivacyConsents.Add(new PrivacyConsent { UserProfileId = context.UserProfileId, PolicyVersion = PrivacyPolicy.CurrentVersion });
            await db.SaveChangesAsync(ct);
        }
        const string source = "bought potatoes for rs 40 using kotak upi";
        var result = await scope.ServiceProvider.GetRequiredService<IExpenseInputProcessor>().ProcessAsync(
            new(source, "test", subject, context.PersonalHouseholdId, InputMode.Text, context.CurrentDate, "INR", "en-IN"), ct);

        Assert.NotNull(result.Transaction);
        var saved = result.Transaction;
        Assert.Equal(40m, saved.Amount); Assert.Equal(TransactionKind.Purchase, saved.Kind);
        Assert.Equal(account.Id, saved.AccountId); Assert.Equal("Kotak", saved.AccountName);
        Assert.Equal(PaymentChannel.UPI, saved.PaymentChannel); Assert.Equal("potatoes", saved.Description);
        Assert.Equal(source, saved.SourceText); Assert.Equal(expectedCategory, saved.CategoryName);
        Assert.Equal(expectedCalls, handler.Calls);
        Assert.Equal($"Tracked ₹40 for potatoes under {expectedCategory ?? "Uncategorized"} using Kotak (UPI).", result.AssistantMessage);
        db.ChangeTracker.Clear();
        var persisted = await db.Transactions.AsNoTracking().SingleAsync(x => x.Id == saved.Id, ct);
        Assert.Equal(account.Id, persisted.AccountId); Assert.Equal(PaymentChannel.UPI, persisted.PaymentChannel);
        Assert.Equal("potatoes", persisted.Description);
        if (expectedCalls > 0)
        {
            Assert.Equal("/v1/systemone", handler.Path); Assert.Equal("Bearer test-key", handler.Authorization);
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
