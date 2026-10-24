/** Existing backend wire contracts. No web or native presentation dependencies. */
import type { FinancialAccount, UserSettings, Transaction } from "./models.ts";
export type HouseholdRole = "Owner" | "Admin" | "Member" | "Viewer";
export type CategoryType = "Expense" | "Income";
export type CategoryClassification = "Essential" | "Discretionary" | "Income" | "Savings" | "Debt";

export type SpendingJudgment = "Healthy" | "Watch" | "NeedsAttention" | "Risky" | "Critical";
export type JudgementSeverity = "Info" | "Nudge" | "Warning" | "Alert";
export type FinancialGoalType = "Saving" | "DebtPayoff" | "Purchase" | "Investment" | "EmergencyFund";
export type FinancialGoalPriority = "Low" | "Medium" | "High";
export type FinancialGoalStatus = "Active" | "Completed" | "Paused" | "Cancelled";
export type GoalContributionSource = "Manual" | "Sip" | "SurplusSweep" | "Transaction";
export type GoalPlanPace = "Comfortable" | "Balanced" | "Aggressive" | "Custom";
export type GoalPlanFeasibility = "Feasible" | "Stretch" | "NotFeasible" | "InsufficientData";
export type GoalPlanningRunStatus = "Pending" | "Processing" | "Succeeded" | "Failed" | "Cancelled";
export type CommitmentCadence = "Monthly" | "Quarterly" | "Annual";
export type AssistantMessageStatus = "Responded" | "NeedsClarification" | "Unsupported" | "Failed";
export type FinanceQuestionKind = "TopSpendingCategory" | "CategorySpendTotal" | "Unknown";
export type JudgementReportCadence = "Weekly" | "Monthly";
export type JudgementReportScope = "Personal" | "Household";
export type JudgementReportDirection = "Improved" | "Worsened" | "Stable" | "InsufficientData";
export type JudgementDirection = "Positive" | "Negative" | "Neutral";
export type JudgementLifecycleStatus = "PendingNarration" | "Active" | "Resolved" | "Expired" | "Superseded";
export type SpendingSummaryStatus = "Calculated" | "AwaitingNarration" | "Published" | "Superseded";
export type NarrationStatus = "NotRequested" | "Pending" | "Succeeded" | "Fallback" | "Failed";
export type MetricTrend = "NotAvailable" | "Unchanged" | "Increased" | "Decreased" | "NewActivity" | "StoppedActivity";
export type SummaryMetricCode =
  | "Income"
  | "ExplicitSavings"
  | "ConsumptionSpend"
  | "EssentialSpend"
  | "DiscretionarySpend"
  | "DebtSpend"
  | "UncategorizedSpend"
  | "CashOutflow"
  | "OperatingSurplus"
  | "CashBalance"
  | "SavingsRate"
  | "SavingsAllocationRate"
  | "ExpenseToIncomeRate"
  | "EssentialShare"
  | "DiscretionaryShare"
  | "DebtShare"
  | "UncategorizedShare";


export type CategorySpendSummary = {
  name: string;
  amount: number;
  budget: number | null;
  tone: SpendingJudgment;
  note: string;
  parentCategoryName?: string | null;
  classification?: CategoryClassification | null;
};

export type DashboardJudgement = {
  id?: string | null;
  ruleCode?: string | null;
  severity?: JudgementSeverity | null;
  title: string;
  tone: SpendingJudgment;
  value: string;
  text: string;
  inputsJson?: string | null;
};

export type DashboardInsight = {
  title: string;
  text: string;
};

export type MonthlyDashboardResponse = {
  month: string;
  periodStart: string;
  periodEnd: string;
  monthLabel: string;
  currencyCode: string;
  income: number;
  spends: number;
  invested: number;
  saved: number;
  savingsRate: number | null;
  investedRate: number | null;
  categories: CategorySpendSummary[];
  judgements: DashboardJudgement[];
  insights: DashboardInsight[];
  recentTransactions: Transaction[];
};

export type FinanceQuestionAnswer = {
  kind: FinanceQuestionKind;
  question: string;
  answer: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  amount: number | null;
  categoryName: string | null;
  categories: CategorySpendSummary[];
};


export type HouseholdSummary = {
  id: string;
  name: string;
  kind: "Personal" | "Family";
  currencyCode: string;
  timeZone: string;
  role: HouseholdRole;
  status: "Pending" | "Active" | "Removed";
  canWrite: boolean;
  memberCount: number;
  createdAt: string;
};

export type HouseholdDashboard = {
  plan: UserPlan;
  canUseHouseholds: boolean;
  defaultHouseholdId: string;
  households: HouseholdSummary[];
};

export type UpdateHouseholdSettingsRequest = {
  currencyCode: string;
  timeZone: string;
};

export type HouseholdInvitation = {
  id: string;
  householdId: string;
  householdName: string;
  email: string;
  role: HouseholdRole;
  status: "Pending" | "Accepted" | "Declined" | "Expired";
  invitedByDisplayName: string;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  deliveryStatus: "Unknown" | "Queued" | "Processing" | "Sent" | "Failed";
  deliveryAttemptCount: number;
  sentAt: string | null;
  lastDeliveryError: string | null;
};


export type Goal = {
  id: string;
  householdId: string;
  userProfileId: string | null;
  createdByUserProfileId: string;
  name: string;
  goalType: FinancialGoalType;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  monthlyTarget: number | null;
  priority: FinancialGoalPriority;
  status: FinancialGoalStatus;
  remainingAmount: number;
  monthsRemaining: number | null;
  requiredMonthlyContribution: number | null;
  projectedMonthlyPace: number | null;
  projectedCompletionDate: string | null;
  achievedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoalPlanMilestone = {
  label: string;
  targetDate: string;
  targetAmount: number;
};

export type GoalPlanOption = {
  id: string;
  pace: GoalPlanPace;
  monthlyContribution: number;
  projectedCompletionDate: string;
  feasibility: GoalPlanFeasibility;
  isRecommended: boolean;
  title: string;
  explanation: string;
  tradeOffs: string[];
  assumptions: string[];
  risks: string[];
  milestones: GoalPlanMilestone[];
};

export type GoalPlanVersion = {
  id: string;
  versionNumber: number;
  source: "Generated" | "Customized" | "AiReviewed";
  sourceVersionId: string | null;
  userContext: string | null;
  createdAt: string;
  options: GoalPlanOption[];
};

export type GoalPlanSummary = {
  id: string;
  status: "Draft" | "Active" | "Superseded" | "Cancelled";
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  versions: GoalPlanVersion[];
};

export type GoalParticipantConsent = {
  goalId: string;
  userProfileId: string;
  policyVersion: string;
  consentedAt: string;
  revokedAt: string | null;
};

export type GoalDetail = {
  goal: Goal;
  plan: GoalPlanSummary | null;
  currentUserConsent: GoalParticipantConsent | null;
};

export type GoalPlanningRun = {
  id: string;
  goalId: string;
  runType: "Generate" | "Review";
  status: GoalPlanningRunStatus;
  resultVersionId: string | null;
  model: string | null;
  retryCount: number;
  failureCategory: string | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: GoalPlanVersion | null;
};

export type GoalContribution = {
  id: string;
  goalId: string;
  userProfileId: string | null;
  amount: number;
  contributedAt: string;
  source: GoalContributionSource;
  transactionId: string | null;
  commitmentId: string | null;
  createdAt: string;
};

export type Commitment = {
  id: string;
  householdId: string;
  userProfileId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  goalId: string | null;
  name: string;
  transactionType: "Expense" | "Investment";
  amount: number;
  cadence: CommitmentCadence;
  nextDueDate: string;
  isActive: boolean;
  lastMatchedAt: string | null;
  lastJudgementAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Judgement = {
  id: string;
  ruleCode: string;
  subjectType: "UserProfile" | "Household";
  subjectId: string;
  householdId: string;
  userProfileId: string | null;
  period: string;
  severity: JudgementSeverity;
  tone: SpendingJudgment;
  title: string;
  value: string;
  message: string;
  inputsJson: string;
  createdAt: string;
  dismissedAt: string | null;
};

export type JudgementReportMetric = {
  code: SummaryMetricCode;
  current: number | null;
  previous: number | null;
  baseline: number | null;
  previousDelta: number | null;
  previousDeltaPercent: number | null;
  baselineDelta: number | null;
  baselineDeltaPercent: number | null;
  previousTrend: MetricTrend;
  baselineTrend: MetricTrend;
};

export type JudgementReportCategory = {
  subjectKey: string;
  categoryId: string | null;
  name: string;
  classification: CategoryClassification | null;
  amount: number;
  share: number | null;
  transactionCount: number;
  previousAmount: number | null;
  previousDeltaAmount: number | null;
  previousDeltaPercent: number | null;
  baselineAmount: number | null;
  baselineDeltaAmount: number | null;
  baselineDeltaPercent: number | null;
  baselineShareDeltaPoints: number | null;
  baselineTrend: MetricTrend;
  isMaterial: boolean;
  direction: JudgementDirection;
};

export type JudgementReportObservation = {
  id: string;
  ruleCode: string;
  issueKey: string;
  direction: JudgementDirection;
  severity: JudgementSeverity;
  severityRank: number;
  tone: SpendingJudgment;
  status: JudgementLifecycleStatus;
  title: string;
  value: string;
  message: string;
  actionCode: string;
  actionParametersJson: string;
  evidenceJson: string;
  resolvedAt: string | null;
  expiresAt: string;
  isDismissed: boolean;
  decisionAction?: "Observe" | "Ask" | "Nudge" | "Ignore" | "Alert" | null;
  followUpQuestion?: string | null;
  importance?: number | null;
};

export type JudgementNarration = {
  headline: string;
  overview: string;
  whatChanged: string[];
  focusAreas: string[];
  actions: string[];
  isDeterministicFallback: boolean;
};

export type JudgementReport = {
  id: string;
  householdId: string;
  userProfileId: string | null;
  scope: JudgementReportScope;
  cadence: JudgementReportCadence;
  period: string;
  startDate: string;
  endDateExclusive: string;
  timeZone: string;
  currencyCode: string;
  revision: number;
  calculationVersion: string;
  status: SpendingSummaryStatus;
  direction: JudgementReportDirection;
  confidence: "Low" | "Sufficient";
  baselinePeriodsUsed: number;
  dataQualityFlags: string[];
  metrics: JudgementReportMetric[];
  categories: JudgementReportCategory[];
  judgements: JudgementReportObservation[];
  narration: JudgementNarration | null;
  narrationStatus: NarrationStatus;
  isProcessingUpdate: boolean;
  calculatedAt: string;
  publishedAt: string | null;
};


export type UserPlan = UserSettings["plan"];
export type SaveFinancialAccount = { householdId: string | null; name: string; accountType: FinancialAccount["accountType"]; institution: string | null; last4: string | null; aliases: string[]; shared: boolean; isActive: boolean };
export type SettingsPatch = Partial<Pick<UserSettings, "currencyCode" | "timeZone" | "requireMerchantForExpenses" | "defaultTransactionVisibility">>;
export type CreateCategory = { householdId?: string; name: string; parentCategoryId?: string; type: CategoryType; classification: CategoryClassification; icon?: string };
export type CreateGoal = { householdId?: string; name: string; goalType: FinancialGoalType; targetAmount: number; targetDate?: string; monthlyTarget?: number; priority: FinancialGoalPriority; isShared: boolean };
export type GoalPatch = Partial<Pick<Goal, "name" | "goalType" | "targetAmount" | "targetDate" | "monthlyTarget" | "priority" | "status">>;
export type ContributionInput = { amount: number; contributedAt?: string; source?: GoalContributionSource; transactionId?: string; commitmentId?: string };
export type PlanningInput = { pace?: GoalPlanPace; targetDate?: string; monthlyContribution?: number; participantUserProfileIds?: string[]; locale?: string };
export type CreateCommitment = { householdId?: string; name: string; categoryName?: string; categoryId?: string; goalId?: string; transactionType: "Expense" | "Investment"; amount: number; cadence: CommitmentCadence; nextDueDate: string; isShared: boolean };
export type CommitmentPatch = Partial<Pick<Commitment, "name" | "categoryName" | "categoryId" | "goalId" | "transactionType" | "amount" | "cadence" | "nextDueDate" | "isActive">>;
export type ReportQuery = { householdId: string; scope: JudgementReportScope; cadence: JudgementReportCadence; period?: string };
export type RegistrationPolicy = { mode: "Open" | "RequestOnly" };
export type SignupInvitation = { email: string; name: string };
export type SignupInput = { email: string; password: string; displayName: string; privacyPolicyVersion: string; acceptPrivacyPolicy: boolean; invitationToken?: string };
