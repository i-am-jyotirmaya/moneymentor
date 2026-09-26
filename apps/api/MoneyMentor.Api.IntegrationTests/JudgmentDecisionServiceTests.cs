using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.Persistence;
using MoneyMentor.Infrastructure.Transactions;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class JudgmentDecisionServiceTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Ignore_terminates_candidate_and_audits_without_surfacing_a_judgment()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString).Options;
        await using var db = new MoneyMentorDbContext(options);
        var owner = new UserProfile
        {
            AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
            Email = "gate@example.test", DisplayName = "Gate", CurrencyCode = "INR", TimeZone = "UTC"
        };
        var household = new Household { Name = "Gate test", CreatedByUserProfileId = owner.Id };
        var candidate = new JudgmentCandidate
        {
            HouseholdId = household.Id, Scope = JudgementReportScope.Household,
            CandidateType = "CATEGORY_SPENDING_SPIKE", SubjectType = "Category",
            SubjectKey = "example", DeduplicationKey = Guid.NewGuid().ToString("N"),
            WindowStart = new DateOnly(2026, 6, 20),
            WindowEndExclusive = new DateOnly(2026, 7, 2),
            InterestingnessScore = 0.10m, DetectorConfidence = 0.80m,
            EvidenceJson = "{\"amount\":100}", Status = JudgmentCandidateStatus.Queued,
            AvailableAt = factory.Clock.GetUtcNow().AddMinutes(-1)
        };
        db.UserProfiles.Add(owner);
        db.Households.Add(household);
        db.JudgmentCandidates.Add(candidate);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var factStore = new DailyFinancialFactStore(db, factory.Clock);
        var context = new JudgmentContextBuilder(db, factStore);
        var jev = new JevJudgmentGate(new HttpClient { BaseAddress = new Uri("https://api.typesafe.ai/") },
            Options.Create(new JevOptions()), NullLogger<JevJudgmentGate>.Instance);
        var explanations = new OpenAiCandidateExplanationClient(new HttpClient
            { BaseAddress = new Uri("https://api.openai.com/v1/") },
            Options.Create(new OpenAiGoalPlanningOptions()));
        var service = new JudgmentDecisionService(db, context, jev, explanations, factory.Clock);

        Assert.True(await service.ProcessNextAsync(CancellationToken.None));
        db.ChangeTracker.Clear();
        Assert.Equal(JudgmentCandidateStatus.Ignored,
            (await db.JudgmentCandidates.SingleAsync(x => x.Id == candidate.Id)).Status);
        Assert.False(await db.Judgements.AnyAsync(x => x.CandidateId == candidate.Id));
        Assert.True(await db.JudgementEvaluationRuns.AnyAsync(x => x.CandidateId == candidate.Id
            && x.Stage == JudgementWorkStage.CandidateDecision && x.Succeeded));
    }
}
