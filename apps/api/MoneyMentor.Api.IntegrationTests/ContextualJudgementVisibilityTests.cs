using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Application.JudgementReports;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Households;
using MoneyMentor.Infrastructure.Judgements;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class ContextualJudgementVisibilityTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Only_active_candidate_decisions_are_visible_and_cadence_does_not_hide_them()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString).Options;
        await using var db = new MoneyMentorDbContext(options);
        var owner = User();
        var other = User();
        var household = new Household { Name = "Contextual judgments", CreatedByUserProfileId = owner.Id };
        db.UserProfiles.AddRange(owner, other);
        db.Households.Add(household);
        db.HouseholdMembers.AddRange(
            new HouseholdMember { HouseholdId = household.Id, UserProfileId = owner.Id,
                Role = HouseholdRole.Owner, Status = HouseholdMemberStatus.Active },
            new HouseholdMember { HouseholdId = household.Id, UserProfileId = other.Id,
                Role = HouseholdRole.Member, Status = HouseholdMemberStatus.Active });
        var candidate = new JudgmentCandidate
        {
            HouseholdId = household.Id, UserProfileId = owner.Id,
            Scope = JudgementReportScope.Personal, CandidateType = "MERCHANT_FREQUENCY",
            SubjectType = "Merchant", SubjectKey = "coffee",
            DeduplicationKey = Guid.NewGuid().ToString("N"),
            WindowStart = new DateOnly(2026, 7, 1), WindowEndExclusive = new DateOnly(2026, 7, 2),
            Status = JudgmentCandidateStatus.Judged
        };
        db.JudgmentCandidates.Add(candidate);
        var contextual = Judgment(owner.Id, candidate.Id);
        db.Judgements.AddRange(contextual, Judgment(owner.Id, null), Judgment(other.Id, null));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var access = new PostgresHouseholdAccessService(db);
        var user = new AppUserContext(owner.Id, household.Id, owner.Email,
            owner.DisplayName, "INR", "UTC", UserPlan.Free, false,
            TransactionVisibility.Private) { CurrentDate = new DateOnly(2026, 7, 1) };
        var judgments = new PostgresJudgementService(db, access, factory.Clock);
        Assert.Equal(contextual.Id, Assert.Single(await judgments.ListAsync(user,
            household.Id, new DateOnly(2026, 7, 1), CancellationToken.None)).Id);

        var reports = new PostgresJudgementReportService(db, access, factory.Clock);
        var visible = await reports.ListActiveAsync(new JudgementReportRequest(user, household.Id,
            JudgementReportScope.Personal, JudgementReportCadence.Monthly), CancellationToken.None);
        Assert.Equal(contextual.Id, Assert.Single(visible).Id);
        Assert.Equal(JudgmentDecisionAction.Ask, visible.Single().DecisionAction);
        Assert.Equal("Was this planned?", visible.Single().FollowUpQuestion);

        Assert.True(await judgments.DismissAsync(user, contextual.Id, CancellationToken.None));
        Assert.Empty(await reports.ListActiveAsync(new JudgementReportRequest(user, household.Id,
            JudgementReportScope.Personal, JudgementReportCadence.Weekly), CancellationToken.None));

        Judgement Judgment(Guid userId, Guid? candidateId) => new()
        {
            HouseholdId = household.Id, UserProfileId = userId,
            Scope = JudgementReportScope.Personal, Cadence = JudgementReportCadence.Weekly,
            CandidateId = candidateId, RuleCode = "CANDIDATE_MERCHANT_FREQUENCY",
            DeduplicationKey = Guid.NewGuid().ToString("N"), IssueKey = Guid.NewGuid().ToString("N"),
            Period = new DateOnly(2026, 7, 1), Status = JudgementLifecycleStatus.Active,
            DecisionAction = candidateId is null ? null : JudgmentDecisionAction.Ask,
            FollowUpQuestion = candidateId is null ? null : "Was this planned?",
            ExpiresAt = factory.Clock.GetUtcNow().AddDays(14)
        };
    }

    private static UserProfile User() => new()
    {
        AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
        Email = Guid.NewGuid().ToString("N") + "@example.test", DisplayName = "Judge",
        CurrencyCode = "INR", TimeZone = "UTC"
    };
}
