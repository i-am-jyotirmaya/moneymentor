using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class FinancialMemoryScopeTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Retrieval_excludes_other_members_private_or_expired_memories()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString).Options;
        await using var db = new MoneyMentorDbContext(options);
        var owner = CreateUser();
        var other = CreateUser();
        var household = new Household { Name = "Memory scope", CreatedByUserProfileId = owner.Id };
        db.UserProfiles.AddRange(owner, other);
        db.Households.Add(household);
        db.HouseholdMembers.AddRange(
            new HouseholdMember { HouseholdId = household.Id, UserProfileId = owner.Id,
                Role = HouseholdRole.Owner, Status = HouseholdMemberStatus.Active },
            new HouseholdMember { HouseholdId = household.Id, UserProfileId = other.Id,
                Role = HouseholdRole.Member, Status = HouseholdMemberStatus.Active });
        db.FinancialContextMemories.AddRange(
            Memory(owner.Id, TransactionVisibility.Household, "We plan travel together"),
            Memory(other.Id, TransactionVisibility.Private, "Private purchase reason"),
            Memory(owner.Id, TransactionVisibility.Private, "Expired plan", factory.Clock.GetUtcNow().AddDays(-1)));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var embedding = new MemoryEmbeddingClient(new HttpClient
            { BaseAddress = new Uri("https://api.openai.com/v1/") },
            Options.Create(new OpenAiGoalPlanningOptions()));
        var store = new FinancialMemoryStore(db, embedding, factory.Clock);
        var personal = await store.GetRelevantAsync(new JudgmentCandidate
            { HouseholdId = household.Id, UserProfileId = owner.Id, Scope = JudgementReportScope.Personal },
            CancellationToken.None);
        var shared = await store.GetRelevantAsync(new JudgmentCandidate
            { HouseholdId = household.Id, Scope = JudgementReportScope.Household }, CancellationToken.None);

        Assert.Equal("We plan travel together", Assert.Single(personal).Text);
        Assert.Equal("We plan travel together", Assert.Single(shared).Text);

        FinancialContextMemory Memory(Guid userId, TransactionVisibility visibility, string text,
            DateTimeOffset? expires = null) => new()
        {
            HouseholdId = household.Id, UserProfileId = userId, Visibility = visibility,
            MemoryType = "SpendingPreference", Text = text, SourceType = "Test",
            ValidUntil = expires, Confidence = 0.9m, Importance = 2m
        };
    }

    private static UserProfile CreateUser() => new()
    {
        AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
        Email = Guid.NewGuid().ToString("N") + "@example.test", DisplayName = "Memory tester",
        CurrencyCode = "INR", TimeZone = "UTC"
    };
}
