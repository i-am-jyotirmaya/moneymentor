using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyMentor.Application.AppUsers;
using MoneyMentor.Domain.Entities;
using MoneyMentor.Domain.Enums;
using MoneyMentor.Infrastructure.Goals;
using MoneyMentor.Infrastructure.Households;
using MoneyMentor.Infrastructure.JudgementReports;
using MoneyMentor.Infrastructure.Persistence;
using Xunit;

namespace MoneyMentor.Api.IntegrationTests;

public sealed class GoalJudgmentSignalReaderTests(MoneyMentorApiFactory factory)
    : IClassFixture<MoneyMentorApiFactory>
{
    [Fact]
    public async Task Shared_goal_receives_only_shared_facts_and_relevant_active_judgments()
    {
        var options = new DbContextOptionsBuilder<MoneyMentorDbContext>()
            .UseNpgsql(factory.ConnectionString).Options;
        await using var db = new MoneyMentorDbContext(options);
        var owner = User();
        var other = User();
        var household = new Household { Name = "Goal signals", CreatedByUserProfileId = owner.Id };
        var goal = new FinancialGoal
        {
            HouseholdId = household.Id, CreatedByUserProfileId = owner.Id, Name = "Travel",
            TargetAmount = 10000m, Status = FinancialGoalStatus.Active
        };
        var unrelatedGoal = new FinancialGoal
        {
            HouseholdId = household.Id, CreatedByUserProfileId = owner.Id, Name = "Car",
            TargetAmount = 100000m, Status = FinancialGoalStatus.Active
        };
        db.UserProfiles.AddRange(owner, other);
        db.Households.Add(household);
        db.HouseholdMembers.AddRange(
            new HouseholdMember { HouseholdId = household.Id, UserProfileId = owner.Id,
                Role = HouseholdRole.Owner, Status = HouseholdMemberStatus.Active },
            new HouseholdMember { HouseholdId = household.Id, UserProfileId = other.Id,
                Role = HouseholdRole.Member, Status = HouseholdMemberStatus.Active });
        db.FinancialGoals.AddRange(goal, unrelatedGoal);
        db.DailyFinancialAggregates.AddRange(
            Fact(owner.Id, TransactionVisibility.Household, 100m),
            Fact(owner.Id, TransactionVisibility.Private, 900m),
            Fact(other.Id, TransactionVisibility.Private, 2000m));
        AddJudgment("GOAL_FUNDING_PRESSURE", goal.Id);
        AddJudgment("GOAL_FUNDING_PRESSURE", unrelatedGoal.Id);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var reader = new PostgresGoalJudgmentSignalReader(db,
            new PostgresHouseholdAccessService(db), new DailyFinancialFactStore(db, factory.Clock),
            factory.Clock);
        var userContext = new AppUserContext(owner.Id, household.Id, owner.Email,
            owner.DisplayName, "INR", "UTC", UserPlan.Free, false,
            TransactionVisibility.Private) { CurrentDate = new DateOnly(2026, 7, 1) };
        var snapshot = await reader.ReadAsync(userContext, goal.Id, CancellationToken.None);

        Assert.Equal(JudgementReportScope.Household, snapshot.Scope);
        Assert.Equal(100m, snapshot.Windows.Single(x => x.Days == 30).Expense);
        Assert.Equal("GOAL_FUNDING_PRESSURE", Assert.Single(snapshot.Judgments).CandidateType);

        DailyFinancialAggregate Fact(Guid userId, TransactionVisibility visibility, decimal amount) => new()
        {
            HouseholdId = household.Id, UserProfileId = userId, Visibility = visibility,
            Date = new DateOnly(2026, 7, 1), Expense = amount, TransactionCount = 1
        };

        void AddJudgment(string type, Guid relevantGoalId)
        {
            var candidate = new JudgmentCandidate
            {
                HouseholdId = household.Id, Scope = JudgementReportScope.Household,
                CandidateType = type, SubjectType = "Goals", SubjectKey = "goals",
                DeduplicationKey = Guid.NewGuid().ToString("N"),
                WindowStart = new DateOnly(2026, 6, 25),
                WindowEndExclusive = new DateOnly(2026, 7, 2),
                EvidenceJson = JsonSerializer.Serialize(new { activeGoalIds = new[] { relevantGoalId } }),
                Status = JudgmentCandidateStatus.Judged
            };
            db.JudgmentCandidates.Add(candidate);
            db.Judgements.Add(new Judgement
            {
                HouseholdId = household.Id, Scope = JudgementReportScope.Household,
                CandidateId = candidate.Id, RuleCode = "CANDIDATE_" + type,
                DeduplicationKey = candidate.DeduplicationKey,
                IssueKey = Guid.NewGuid().ToString("N"), Period = new DateOnly(2026, 6, 25),
                Status = JudgementLifecycleStatus.Active, DecisionAction = JudgmentDecisionAction.Nudge,
                Importance = 3m, DecisionConfidence = 0.9m,
                ExpiresAt = factory.Clock.GetUtcNow().AddDays(14)
            });
        }
    }

    private static UserProfile User() => new()
    {
        AuthProvider = "test", AuthSubject = Guid.NewGuid().ToString(),
        Email = Guid.NewGuid().ToString("N") + "@example.test", DisplayName = "Goal tester",
        CurrencyCode = "INR", TimeZone = "UTC"
    };
}
