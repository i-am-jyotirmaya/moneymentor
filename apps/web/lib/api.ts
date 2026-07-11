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
export type SpendingJudgment = "Healthy" | "Watch" | "NeedsAttention" | "Risky" | "Critical";
export type AssistantMessageStatus = "Responded" | "NeedsClarification" | "Unsupported" | "Failed";
export type FinanceQuestionKind = "TopSpendingCategory" | "CategorySpendTotal" | "Unknown";

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
  type: "Expense" | "Income" | "Transfer";
  categoryName: string | null;
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
};

export type DashboardJudgement = {
  title: string;
  tone: SpendingJudgment;
  value: string;
  text: string;
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
  saved: number;
  savingsRate: number | null;
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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
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
  { accessToken, method = "GET", body }: RequestOptions = {},
  allowRefresh = true,
) {
  const headers = new Headers();

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
        { accessToken: refreshed.accessToken, method, body },
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

export function acceptPrivacyConsent(accessToken: string) {
  return apiRequest<{ policyVersion: string; acceptedAt: string }>("/api/privacy/consents", {
    accessToken,
    method: "POST",
    body: { policyVersion: "2026-07-03-beta.1", accepted: true },
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
