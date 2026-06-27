namespace MoneyMentor.Domain.Enums;

public enum HouseholdRole
{
    Owner,
    Admin,
    Member,
    Viewer
}

public enum HouseholdKind
{
    Personal,
    Family
}

public enum HouseholdMemberStatus
{
    Pending,
    Active,
    Removed
}

public enum UserPlan
{
    Free,
    Premium
}

public enum CategoryType
{
    Expense,
    Income
}

public enum TransactionType
{
    Expense,
    Income,
    Transfer
}

public enum InputMode
{
    Text,
    Voice,
    System
}

public enum TransactionVisibility
{
    Private,
    Household
}

public enum MessageRole
{
    User,
    Assistant,
    System
}

public enum InsightSeverity
{
    Low,
    Medium,
    High,
    Critical
}

public enum SpendingJudgment
{
    Healthy,
    Watch,
    NeedsAttention,
    Risky,
    Critical
}

public enum InsightStatus
{
    Unread,
    Read,
    Dismissed,
    Accepted
}

public enum AgentRunStatus
{
    Running,
    Completed,
    Failed
}

public enum FinancialGoalPriority
{
    Low,
    Medium,
    High
}

public enum FinancialGoalStatus
{
    Active,
    Completed,
    Paused,
    Cancelled
}
