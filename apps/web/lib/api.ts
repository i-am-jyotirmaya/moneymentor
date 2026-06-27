const DEFAULT_API_BASE_URL = "http://localhost:5267";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
};

export type AuthSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
};

export type InputMode = "Text" | "Voice" | "System";
export type TransactionVisibility = "Private" | "Household";
export type UserPlan = "Free" | "Premium";
export type HouseholdRole = "Owner" | "Admin" | "Member" | "Viewer";

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

export type TransactionListItem = {
  id: string;
  householdId: string;
  userProfileId: string;
  amount: number;
  currencyCode: string;
  type: "Expense" | "Income" | "Transfer";
  categoryName: string | null;
  merchantName: string | null;
  description: string | null;
  sourceText: string;
  transactionDate: string;
  inputMode: InputMode;
  confidence: number;
  visibility: TransactionVisibility;
  createdAt: string;
  updatedAt: string;
  updatedByDisplayName: string | null;
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
  plan: UserPlan;
  requireMerchantForExpenses: boolean;
  defaultTransactionVisibility: TransactionVisibility;
}>;

export type HouseholdSummary = {
  id: string;
  name: string;
  kind: "Personal" | "Family";
  role: HouseholdRole;
  status: "Pending" | "Active" | "Removed";
  memberCount: number;
  createdAt: string;
};

export type HouseholdDashboard = {
  plan: UserPlan;
  canUseHouseholds: boolean;
  households: HouseholdSummary[];
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
  method?: "GET" | "POST" | "PATCH";
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
  });

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

export function listTransactions(accessToken: string, limit = 50) {
  return apiRequest<TransactionListItem[]>(`/api/transactions?limit=${limit}`, {
    accessToken,
  });
}

export function updateTransaction(
  accessToken: string,
  transactionId: string,
  input: Partial<{
    amount: number;
    categoryName: string;
    merchantName: string;
    description: string;
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

export function addHouseholdMember(
  accessToken: string,
  householdId: string,
  input: {
    email: string;
    role: HouseholdRole;
  },
) {
  return apiRequest<HouseholdSummary>(`/api/households/${householdId}/members`, {
    accessToken,
    method: "POST",
    body: input,
  });
}
