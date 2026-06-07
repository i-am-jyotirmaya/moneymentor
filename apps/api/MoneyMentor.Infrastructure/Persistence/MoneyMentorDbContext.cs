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

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<Transaction> Transactions => Set<Transaction>();

    public DbSet<AssistantSession> AssistantSessions => Set<AssistantSession>();

    public DbSet<AssistantMessage> AssistantMessages => Set<AssistantMessage>();

    public DbSet<PendingAction> PendingActions => Set<PendingAction>();

    public DbSet<Insight> Insights => Set<Insight>();

    public DbSet<AgentRun> AgentRuns => Set<AgentRun>();

    public DbSet<FinancialGoal> FinancialGoals => Set<FinancialGoal>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(AppSchema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(MoneyMentorDbContext).Assembly);
    }
}
