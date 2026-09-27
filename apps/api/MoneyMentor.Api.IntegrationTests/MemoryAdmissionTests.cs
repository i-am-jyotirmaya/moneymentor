using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MoneyMentor.Application.Privacy;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Infrastructure.Transactions;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class MemoryAdmissionTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Admits_consented_explanation_and_preserves_original_text()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString).Options;
        await using var db = new MoneyMentorDbContext(options);
        var owner = new UserProfile
        {
            AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
            Email = Guid.NewGuid().ToString("N") + "@example.test", DisplayName = "Memory owner",
            CurrencyCode = "INR", TimeZone = "UTC"
        };
        var household = new Household { Name = "Admission test", CreatedByUserProfileId = owner.Id };
        var judgement = new Judgement
        {
            HouseholdId = household.Id, UserProfileId = owner.Id, Scope = JudgementReportScope.Personal,
            RuleCode = "REPEATED_SPENDING", DeduplicationKey = Guid.NewGuid().ToString("N"),
            IssueKey = Guid.NewGuid().ToString("N"), Period = new DateOnly(2026, 7, 1),
            ExpiresAt = factory.Clock.GetUtcNow().AddDays(30)
        };
        const string original = "I bought the train pass for my work commute this month.";
        var feedback = new JudgmentFeedback
        {
            HouseholdId = household.Id, UserProfileId = owner.Id, JudgementId = judgement.Id,
            Text = original, AvailableAt = factory.Clock.GetUtcNow(), CreatedAt = factory.Clock.GetUtcNow()
        };
        db.UserProfiles.Add(owner);
        db.Households.Add(household);
        db.Judgements.Add(judgement);
        db.JudgmentFeedback.Add(feedback);
        db.PrivacyConsents.Add(new PrivacyConsent
        {
            UserProfileId = owner.Id, PolicyVersion = PrivacyPolicy.CurrentVersion,
            AcceptedAt = factory.Clock.GetUtcNow()
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var jev = new JevMemoryAdmissionClient(new HttpClient(new StubHandler())
            { BaseAddress = new Uri("https://api.typesafe.ai/") },
            Options.Create(new JevOptions { ApiKey = "test-key" }));
        var embeddings = new MemoryEmbeddingClient(new HttpClient(),
            Options.Create(new OpenAiGoalPlanningOptions()));
        var store = new FinancialMemoryStore(db, embeddings, factory.Clock);
        var service = new MemoryAdmissionService(db, jev, embeddings, store, factory.Clock);
        Assert.True(await service.ProcessNextAsync(CancellationToken.None));
        db.ChangeTracker.Clear();

        var saved = await db.FinancialContextMemories.SingleAsync(x => x.SourceFeedbackId == feedback.Id);
        Assert.Equal(original, saved.Text);
        Assert.Equal("PurchaseExplanation", saved.MemoryType);
        Assert.Equal(TransactionVisibility.Private, saved.Visibility);
        Assert.Equal("Admitted", (await db.JudgmentFeedback.SingleAsync(x => x.Id == feedback.Id)).Status);
        var relevant = await store.GetRelevantAsync(new JudgmentCandidate
        {
            HouseholdId = household.Id, UserProfileId = owner.Id, Scope = JudgementReportScope.Personal
        }, CancellationToken.None);
        Assert.Equal(original, Assert.Single(relevant).Text);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Assert.Equal("/v1/systemone", request.RequestUri?.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""
                    {"answers":{"durable":{"noul":0.95},"memoryType":{"choice":"PurchaseExplanation","confidence":0.93},"importance":{"score":3}}}
                    """)
            });
        }
    }
}
