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

public enum HouseholdInvitationStatus
{
    Pending,
    Accepted,
    Declined,
    Expired
}

public enum InvitationDeliveryStatus
{
    Unknown,
    Queued,
    Processing,
    Sent,
    Failed
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

public enum CategoryClassification
{
    Essential,
    Discretionary,
    Income,
    Savings,
    Debt
}

public enum TransactionType
{
    Expense,
    Income,
    Investment,
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

public enum FinancialGoalType
{
    Saving,
    DebtPayoff,
    Purchase,
    Investment,
    EmergencyFund
}

public enum GoalContributionSource
{
    Manual,
    Sip,
    SurplusSweep,
    Transaction
}

public enum GoalPlanStatus
{
    Draft,
    Active,
    Superseded,
    Cancelled
}

public enum GoalPlanPace
{
    Comfortable,
    Balanced,
    Aggressive,
    Custom
}

public enum GoalPlanFeasibility
{
    Feasible,
    Stretch,
    NotFeasible,
    InsufficientData
}

public enum GoalPlanVersionSource
{
    Generated,
    Customized,
    AiReviewed
}

public enum GoalPlanningRunStatus
{
    Pending,
    Processing,
    Succeeded,
    Failed,
    Cancelled
}

public enum GoalPlanningRunType
{
    Generate,
    Review
}

public enum CommitmentCadence
{
    Monthly,
    Quarterly,
    Annual
}

public enum JudgementRuleCategory
{
    Spending,
    Savings,
    Goals,
    Cashflow,
    Recurring,
    Household
}

public enum JudgementSeverity
{
    Info,
    Nudge,
    Warning,
    Alert
}

public enum JudgementSubjectType
{
    UserProfile,
    Household
}

public enum JudgementReportCadence
{
    Weekly,
    Monthly,
    Quarterly
}

public enum JudgementReportScope
{
    Personal,
    Household
}

public enum JudgementDirection
{
    Positive,
    Negative,
    Neutral
}

public enum JudgementReportDirection
{
    Improved,
    Worsened,
    Stable,
    InsufficientData
}

public enum JudgementDataConfidence
{
    Low,
    Sufficient
}

public enum MetricTrend
{
    NotAvailable,
    Unchanged,
    Increased,
    Decreased,
    NewActivity,
    StoppedActivity
}

public enum SpendingSummaryStatus
{
    Calculated,
    AwaitingNarration,
    Published,
    Superseded
}

public enum NarrationStatus
{
    NotRequested,
    Pending,
    Succeeded,
    Fallback,
    Failed
}

public enum JudgementLifecycleStatus
{
    PendingNarration,
    Active,
    Resolved,
    Expired,
    Superseded
}

public enum JudgementWorkStatus
{
    Pending,
    Processing,
    Completed,
    DeadLetter
}

public enum JudgementWorkStage
{
    Calculation,
    Narration
}

public enum CommitmentOccurrenceStatus
{
    Expected,
    Matched,
    Missed
}
