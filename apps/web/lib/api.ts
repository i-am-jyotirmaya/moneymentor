import {
  clearAuthSession,
  getAuthSessionSnapshot,
  saveAuthSession,
} from "./auth-session";

const DEFAULT_API_BASE_URL = "http://localhost:5267";
let refreshPromise: Promise<AuthSession> | null = null;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

export type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: AuthUser;
  requiresPrivacyConsent: boolean;
};

export type InputMode = "Text" | "Voice" | "System";
export type TransactionVisibility = "Private" | "Household";
export type UserPlan = "Free" | "Premium";
export type HouseholdRole = "Owner" | "Admin" | "Member" | "Viewer";
export type CategoryType = "Expense" | "Income";
export type CategoryClassification = "Essential" | "Discretionary" | "Income" | "Savings" | "Debt";
export type TransactionType = "Expense" | "Income" | "Investment" | "Transfer";
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

export type ExpenseDraft = {
  amount: number | null;
  categoryGuess: string | null;
  merchantName: string | null;
  description: string | null;
  transactionDate: string | null;
  sourceText: string;
  inputMode: InputMode;
  confidence: number;
  missingFields: string[];
};

export type IncomeDraft = {
  amount: number | null;
  senderName: string | null;
  reason: string | null;
  transactionDate: string | null;
  sourceText: string;
  inputMode: InputMode;
  confidence: number;
  missingFields: string[];
};

export type TransactionListItem = {
  id: string;
  householdId: string;
  userProfileId: string | null;
  amount: number;
  currencyCode: string;
  type: TransactionType;
  categoryName: string | null;
  parentCategoryName?: string | null;
  categoryClassification?: CategoryClassification | null;
  merchantName: string | null;
  description: string | null;
  senderName: string | null;
  reason: string | null;
  sourceText: string;
  transactionDate: string;
  inputMode: InputMode;
  confidence: number;
  visibility: TransactionVisibility;
  createdAt: string;
  updatedAt: string;
  updatedByDisplayName: string | null;
  deletedAt: string | null;
  purgeAfter: string | null;
};

export type TransactionPageResponse = {
  items: TransactionListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  month: string;
};

export type TransactionTrashResponse = {
  items: TransactionListItem[];
};

export type ExpenseInputResponse = {
  status: "Parsed" | "NeedsClarification" | "Unsupported" | "Failed";
  intent:
    | "CreateExpense"
    | "CreateIncome"
    | "AskFinanceQuestion"
    | "AskGoalAdvice"
    | "ClarificationResponse"
    | "Unknown";
  transaction: TransactionListItem | null;
  parsedDebug: ExpenseDraft | null;
  assistantMessage: string | null;
  errors: string[];
};

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
  recentTransactions: TransactionListItem[];
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

export type AssistantMessageResponse = {
  status: AssistantMessageStatus;
  intent:
    | "CreateExpense"
    | "CreateIncome"
    | "AskFinanceQuestion"
    | "AskGoalAdvice"
    | "ClarificationResponse"
    | "Unknown";
  assistantMessage: string | null;
  transaction: TransactionListItem | null;
  parsedDebug: ExpenseDraft | null;
  parsedIncomeDebug: IncomeDraft | null;
  financeAnswer: FinanceQuestionAnswer | null;
  errors: string[];
};

export type UserSettingsResponse = {
  userProfileId: string;
  email: string;
  displayName: string;
  currencyCode: string;
  timeZone: string;
  plan: UserPlan;
  requireMerchantForExpenses: boolean;
  defaultTransactionVisibility: TransactionVisibility;
};

export type UpdateUserSettingsRequest = Partial<{
  currencyCode: string;
  timeZone: string;
  requireMerchantForExpenses: boolean;
  defaultTransactionVisibility: TransactionVisibility;
}>;

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

export type CategoryItem = {
  id: string;
  householdId: string | null;
  parentCategoryId: string | null;
  name: string;
  type: CategoryType;
  classification: CategoryClassification;
  isSystemCategory: boolean;
  icon: string | null;
  sortOrder: number;
  isHidden: boolean;
  createdAt: string;
};

export type CategoryCatalogResponse = {
  householdId: string;
  canWrite: boolean;
  categories: CategoryItem[];
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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  accessToken?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    DEFAULT_API_BASE_URL
  );
}

async function readResponseError(response: Response) {
  try {
    const body = (await response.json()) as {
      errors?: string[] | Record<string, string[]>;
      title?: string;
      detail?: string;
    };

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors;
    }

    if (body.errors && typeof body.errors === "object") {
      const validationErrors = Object.values(body.errors).flat();
      if (validationErrors.length > 0) {
        return validationErrors;
      }
    }

    return [body.detail ?? body.title ?? response.statusText];
  } catch {
    return [response.statusText || "Request failed."];
  }
}

async function apiRequest<TResponse>(
  path: string,
  { accessToken, method = "GET", body, headers: requestHeaders }: RequestOptions = {},
  allowRefresh = true,
) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(requestHeaders ?? {})) {
    headers.set(name, value);
  }

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "include",
  });

  if (response.status === 401 && allowRefresh && !path.startsWith("/api/auth/")) {
    try {
      const refreshed = await refreshSession();
      return apiRequest<TResponse>(
        path,
        { accessToken: refreshed.accessToken, method, body, headers: requestHeaders },
        false,
      );
    } catch {
      clearAuthSession();
    }
  }

  if (!response.ok) {
    const errors = await readResponseError(response);
    throw new ApiError(errors[0] ?? "Request failed.", response.status, errors);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function createUser(input: {
  email: string;
  password: string;
  displayName: string;
  privacyPolicyVersion: string;
  acceptPrivacyPolicy: boolean;
}) {
  return apiRequest<AuthSession>("/api/auth/users", {
    method: "POST",
    body: input,
  });
}

export function login(input: { email: string; password: string }) {
  return apiRequest<AuthSession>("/api/auth/login", {
    method: "POST",
    body: input,
  });
}

export function submitExpenseInput(
  accessToken: string,
  input: {
    text: string;
    inputMode: "Text" | "Voice";
    transactionDate?: string;
    currencyCode?: string;
    locale?: string;
  },
) {
  return apiRequest<ExpenseInputResponse>("/api/expenses/input", {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function submitAssistantMessage(
  accessToken: string,
  input: {
    text: string;
    inputMode: "Text" | "Voice";
    householdId?: string;
    transactionDate?: string;
    currencyCode?: string;
    locale?: string;
  },
) {
  return apiRequest<AssistantMessageResponse>("/api/assistant/messages", {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function listTransactions(
  accessToken: string,
  input: {
    month?: string;
    page?: number;
    pageSize?: number;
    householdId?: string;
  } = {},
) {
  const params = new URLSearchParams();

  if (input.month) {
    params.set("month", input.month);
  }

  if (input.page) {
    params.set("page", input.page.toString());
  }

  if (input.pageSize) {
    params.set("pageSize", input.pageSize.toString());
  }

  if (input.householdId) {
    params.set("householdId", input.householdId);
  }

  const queryString = params.toString();
  return apiRequest<TransactionPageResponse>(
    `/api/transactions${queryString ? `?${queryString}` : ""}`,
    { accessToken },
  );
}

export function refreshSession() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const performRefresh = async () => {
    const response = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const errors = await readResponseError(response);
      throw new ApiError(errors[0] ?? "Session refresh failed.", response.status, errors);
    }

    const session = (await response.json()) as AuthSession;
    saveAuthSession(session);
    return session;
  };

  refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function logout(accessToken?: string) {
  try {
    await apiRequest<void>(
      "/api/auth/logout",
      {
        accessToken: accessToken ?? getAuthSessionSnapshot()?.accessToken,
        method: "POST",
      },
      false,
    );
  } finally {
    clearAuthSession();
  }
}

export function getMonthlyDashboard(
  accessToken: string,
  input: {
    month?: string;
    householdId?: string;
  } = {},
) {
  const params = new URLSearchParams();

  if (input.month) {
    params.set("month", input.month);
  }

  if (input.householdId) {
    params.set("householdId", input.householdId);
  }

  const queryString = params.toString();
  return apiRequest<MonthlyDashboardResponse>(
    `/api/dashboard/monthly${queryString ? `?${queryString}` : ""}`,
    { accessToken },
  );
}

export function updateTransaction(
  accessToken: string,
  transactionId: string,
  input: Partial<{
    amount: number;
    categoryName: string;
    merchantName: string;
    description: string;
    senderName: string;
    reason: string;
    transactionDate: string;
    visibility: TransactionVisibility;
  }>,
) {
  return apiRequest<TransactionListItem>(`/api/transactions/${transactionId}`, {
    accessToken,
    method: "PATCH",
    body: input,
  });
}

export function getUserSettings(accessToken: string) {
  return apiRequest<UserSettingsResponse>("/api/settings/me", { accessToken });
}

export function updateUserSettings(
  accessToken: string,
  input: UpdateUserSettingsRequest,
) {
  return apiRequest<UserSettingsResponse>("/api/settings/me", {
    accessToken,
    method: "PATCH",
    body: input,
  });
}

export function listHouseholds(accessToken: string) {
  return apiRequest<HouseholdDashboard>("/api/households", { accessToken });
}

export function createHousehold(accessToken: string, name: string) {
  return apiRequest<HouseholdSummary>("/api/households", {
    accessToken,
    method: "POST",
    body: { name },
  });
}

export function createHouseholdInvitation(
  accessToken: string,
  householdId: string,
  input: {
    email: string;
    role: HouseholdRole;
  },
) {
  return apiRequest<HouseholdInvitation>(`/api/households/${householdId}/invitations`, {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function updateHouseholdSettings(
  accessToken: string,
  householdId: string,
  input: UpdateHouseholdSettingsRequest,
) {
  return apiRequest<HouseholdSummary>(`/api/households/${householdId}/settings`, {
    accessToken,
    method: "PATCH",
    body: input,
  });
}

export function listHouseholdInvitations(accessToken: string) {
  return apiRequest<HouseholdInvitation[]>("/api/households/invitations", { accessToken });
}

export function listSentHouseholdInvitations(accessToken: string, householdId: string) {
  return apiRequest<HouseholdInvitation[]>(
    `/api/households/${householdId}/invitations`,
    { accessToken },
  );
}

export function respondToHouseholdInvitation(
  accessToken: string,
  invitationId: string,
  response: "accept" | "decline",
) {
  return apiRequest<HouseholdInvitation>(
    `/api/households/invitations/${invitationId}/${response}`,
    { accessToken, method: "POST" },
  );
}

export function deleteTransaction(accessToken: string, transactionId: string) {
  return apiRequest<TransactionListItem>(`/api/transactions/${transactionId}`, {
    accessToken,
    method: "DELETE",
  });
}

export function restoreTransaction(accessToken: string, transactionId: string) {
  return apiRequest<TransactionListItem>(`/api/transactions/${transactionId}/restore`, {
    accessToken,
    method: "POST",
  });
}

export function listDeletedTransactions(accessToken: string, householdId?: string) {
  const query = householdId ? `?householdId=${encodeURIComponent(householdId)}` : "";
  return apiRequest<TransactionTrashResponse>(`/api/transactions/trash${query}`, { accessToken });
}

export function listCategories(accessToken: string, householdId?: string) {
  const query = householdId ? `?householdId=${encodeURIComponent(householdId)}` : "";
  return apiRequest<CategoryCatalogResponse>(`/api/categories${query}`, { accessToken });
}

export function createCategory(
  accessToken: string,
  input: {
    householdId?: string;
    name: string;
    parentCategoryId?: string;
    type: CategoryType;
    classification: CategoryClassification;
    icon?: string;
  },
) {
  return apiRequest<CategoryItem>("/api/categories", {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function listGoals(accessToken: string, householdId?: string) {
  const query = householdId ? `?householdId=${encodeURIComponent(householdId)}` : "";
  return apiRequest<Goal[]>(`/api/goals${query}`, { accessToken });
}

export function createGoal(
  accessToken: string,
  input: {
    householdId?: string;
    name: string;
    goalType: FinancialGoalType;
    targetAmount: number;
    targetDate?: string;
    monthlyTarget?: number;
    priority: FinancialGoalPriority;
    isShared: boolean;
  },
) {
  return apiRequest<Goal>("/api/goals", {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function updateGoal(
  accessToken: string,
  goalId: string,
  input: Partial<{
    name: string;
    goalType: FinancialGoalType;
    targetAmount: number;
    targetDate: string;
    monthlyTarget: number;
    priority: FinancialGoalPriority;
    status: FinancialGoalStatus;
  }>,
) {
  return apiRequest<Goal>(`/api/goals/${goalId}`, {
    accessToken,
    method: "PATCH",
    body: input,
  });
}

export function addGoalContribution(
  accessToken: string,
  goalId: string,
  input: {
    amount: number;
    contributedAt?: string;
    source?: GoalContributionSource;
    transactionId?: string;
    commitmentId?: string;
  },
) {
  return apiRequest<GoalContribution>(`/api/goals/${goalId}/contributions`, {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function getGoal(accessToken: string, goalId: string) {
  return apiRequest<GoalDetail>(`/api/goals/${goalId}`, { accessToken });
}

export function createGoalPlanningRun(
  accessToken: string,
  goalId: string,
  input: {
    pace?: GoalPlanPace;
    targetDate?: string;
    monthlyContribution?: number;
    participantUserProfileIds?: string[];
    locale?: string;
  },
) {
  return apiRequest<GoalPlanningRun>(`/api/goals/${goalId}/planning-runs`, {
    accessToken,
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
}

export function getGoalPlanningRun(accessToken: string, goalId: string, runId: string) {
  return apiRequest<GoalPlanningRun>(`/api/goals/${goalId}/planning-runs/${runId}`, {
    accessToken,
  });
}

export function activateGoalPlan(
  accessToken: string,
  goalId: string,
  versionId: string,
) {
  return apiRequest<GoalPlanVersion>(`/api/goals/${goalId}/plans/${versionId}/activate`, {
    accessToken,
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
}

export function customizeGoalPlan(
  accessToken: string,
  goalId: string,
  versionId: string,
  input: {
    pace: GoalPlanPace;
    targetDate?: string;
    monthlyContribution?: number;
    context?: string;
  },
) {
  return apiRequest<GoalPlanVersion>(
    `/api/goals/${goalId}/plans/${versionId}/customizations`,
    { accessToken, method: "POST", body: input },
  );
}

export function reviewGoalPlan(
  accessToken: string,
  goalId: string,
  versionId: string,
  locale = "en-IN",
) {
  return apiRequest<GoalPlanningRun>(
    `/api/goals/${goalId}/plans/${versionId}/review-runs`,
    {
      accessToken,
      method: "POST",
      body: { locale },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    },
  );
}

export function putGoalParticipantConsent(accessToken: string, goalId: string) {
  return apiRequest<GoalParticipantConsent>(`/api/goals/${goalId}/participant-consent`, {
    accessToken,
    method: "PUT",
  });
}

export function deleteGoalParticipantConsent(accessToken: string, goalId: string) {
  return apiRequest<void>(`/api/goals/${goalId}/participant-consent`, {
    accessToken,
    method: "DELETE",
  });
}

export function listCommitments(accessToken: string, householdId?: string) {
  const query = householdId ? `?householdId=${encodeURIComponent(householdId)}` : "";
  return apiRequest<Commitment[]>(`/api/commitments${query}`, { accessToken });
}

export function createCommitment(
  accessToken: string,
  input: {
    householdId?: string;
    name: string;
    categoryName?: string;
    categoryId?: string;
    goalId?: string;
    transactionType: "Expense" | "Investment";
    amount: number;
    cadence: CommitmentCadence;
    nextDueDate: string;
    isShared: boolean;
  },
) {
  return apiRequest<Commitment>("/api/commitments", {
    accessToken,
    method: "POST",
    body: input,
  });
}

export function updateCommitment(
  accessToken: string,
  commitmentId: string,
  input: Partial<{
    name: string;
    categoryName: string;
    categoryId: string;
    goalId: string;
    transactionType: "Expense" | "Investment";
    amount: number;
    cadence: CommitmentCadence;
    nextDueDate: string;
    isActive: boolean;
  }>,
) {
  return apiRequest<Commitment>(`/api/commitments/${commitmentId}`, {
    accessToken,
    method: "PATCH",
    body: input,
  });
}

export function listJudgements(
  accessToken: string,
  input: { householdId?: string; month?: string } = {},
) {
  const params = new URLSearchParams();
  if (input.householdId) {
    params.set("householdId", input.householdId);
  }
  if (input.month) {
    params.set("month", input.month);
  }
  const query = params.toString();
  return apiRequest<Judgement[]>(`/api/judgements${query ? `?${query}` : ""}`, { accessToken });
}

export function dismissJudgement(accessToken: string, judgementId: string) {
  return apiRequest<void>(`/api/judgements/${judgementId}/dismiss`, {
    accessToken,
    method: "POST",
  });
}

export function getJudgementReport(
  accessToken: string,
  input: {
    householdId: string;
    scope: JudgementReportScope;
    cadence: JudgementReportCadence;
    period?: string;
  },
) {
  const params = judgementReportParams(input);
  return apiRequest<JudgementReport>(`/api/judgement-reports?${params}`, { accessToken });
}

export function listJudgementReportHistory(
  accessToken: string,
  input: {
    householdId: string;
    scope: JudgementReportScope;
    cadence: JudgementReportCadence;
    before?: string;
    limit?: number;
  },
) {
  const params = judgementReportParams(input);
  if (input.before) {
    params.set("before", input.before);
  }
  if (input.limit) {
    params.set("limit", input.limit.toString());
  }
  return apiRequest<JudgementReport[]>(`/api/judgement-reports/history?${params}`, {
    accessToken,
  });
}

export function listActiveJudgements(
  accessToken: string,
  input: {
    householdId: string;
    scope: JudgementReportScope;
    cadence: JudgementReportCadence;
  },
) {
  const params = judgementReportParams(input);
  return apiRequest<JudgementReportObservation[]>(`/api/judgements/active?${params}`, {
    accessToken,
  });
}

function judgementReportParams(input: {
  householdId: string;
  scope: JudgementReportScope;
  cadence: JudgementReportCadence;
  period?: string;
}) {
  const params = new URLSearchParams({
    householdId: input.householdId,
    scope: input.scope,
    cadence: input.cadence,
  });
  if (input.period) {
    params.set("period", input.period);
  }
  return params;
}

export function acceptPrivacyConsent(accessToken: string) {
  return apiRequest<{ policyVersion: string; acceptedAt: string }>("/api/privacy/consents", {
    accessToken,
    method: "POST",
    body: { policyVersion: "2026-07-26-ai-planning.1", accepted: true },
  });
}

export async function downloadPrivacyExport(accessToken: string) {
  let response = await fetch(`${getApiBaseUrl()}/api/privacy/export`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  if (response.status === 401) {
    const session = await refreshSession();
    response = await fetch(`${getApiBaseUrl()}/api/privacy/export`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      credentials: "include",
    });
  }
  if (!response.ok) {
    const errors = await readResponseError(response);
    throw new ApiError(errors[0] ?? "Export failed.", response.status, errors);
  }

  return {
    blob: await response.blob(),
    fileName:
      response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
      "moneymentor-export.json",
  };
}

export function deleteAccount(
  accessToken: string,
  input: { password: string; confirmation: string },
) {
  return apiRequest<void>("/api/privacy/account", {
    accessToken,
    method: "DELETE",
    body: input,
  });
}
