using Microsoft.EntityFrameworkCore;
using MoneyMentor.Domain.Entities;

namespace MoneyMentor.Infrastructure.Persistence;

public sealed class MoneyMentorDbContext : DbContext
{
    public const string AppSchema = "app";

    public MoneyMentorDbContext(DbContextOptions<MoneyMentorDbContext> options)
        : base(options)
    {
    }

    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();

    public DbSet<Household> Households => Set<Household>();

    public DbSet<HouseholdMember> HouseholdMembers => Set<HouseholdMember>();

    public DbSet<HouseholdInvitation> HouseholdInvitations => Set<HouseholdInvitation>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<Transaction> Transactions => Set<Transaction>();

    public DbSet<TransactionAuditEntry> TransactionAuditEntries => Set<TransactionAuditEntry>();

    public DbSet<AssistantSession> AssistantSessions => Set<AssistantSession>();

    public DbSet<AssistantMessage> AssistantMessages => Set<AssistantMessage>();

    public DbSet<PendingAction> PendingActions => Set<PendingAction>();

    public DbSet<Insight> Insights => Set<Insight>();

    public DbSet<AgentRun> AgentRuns => Set<AgentRun>();

    public DbSet<FinancialGoal> FinancialGoals => Set<FinancialGoal>();

    public DbSet<GoalContribution> GoalContributions => Set<GoalContribution>();

    public DbSet<GoalPlan> GoalPlans => Set<GoalPlan>();

    public DbSet<GoalPlanVersion> GoalPlanVersions => Set<GoalPlanVersion>();

    public DbSet<GoalPlanOption> GoalPlanOptions => Set<GoalPlanOption>();

    public DbSet<GoalPlanningRun> GoalPlanningRuns => Set<GoalPlanningRun>();

    public DbSet<GoalPlanParticipantConsent> GoalPlanParticipantConsents => Set<GoalPlanParticipantConsent>();

    public DbSet<Commitment> Commitments => Set<Commitment>();

    public DbSet<JudgementRule> JudgementRules => Set<JudgementRule>();

    public DbSet<Judgement> Judgements => Set<Judgement>();

    public DbSet<SpendingSummary> SpendingSummaries => Set<SpendingSummary>();

    public DbSet<SpendingSummaryCategory> SpendingSummaryCategories => Set<SpendingSummaryCategory>();

    public DbSet<JudgementSchedule> JudgementSchedules => Set<JudgementSchedule>();

    public DbSet<JudgementWorkItem> JudgementWorkItems => Set<JudgementWorkItem>();

    public DbSet<JudgementEvaluationRun> JudgementEvaluationRuns => Set<JudgementEvaluationRun>();

    public DbSet<JudgementUserState> JudgementUserStates => Set<JudgementUserState>();

    public DbSet<CommitmentOccurrence> CommitmentOccurrences => Set<CommitmentOccurrence>();

    public DbSet<PrivacyConsent> PrivacyConsents => Set<PrivacyConsent>();

    public DbSet<EntitlementChange> EntitlementChanges => Set<EntitlementChange>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(AppSchema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(MoneyMentorDbContext).Assembly,
            type => type.Namespace == typeof(Configurations.TransactionConfiguration).Namespace);
    }
}
