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

export type ExpenseDraft = {
  amount: number | null;
  categoryGuess: string | null;
  merchantName: string | null;
  description: string | null;
  transactionDate: string | null;
  sourceText: string;
  inputMode: "Text" | "Voice" | "System";
  confidence: number;
  missingFields: string[];
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
  draft: ExpenseDraft | null;
  assistantMessage: string | null;
  errors: string[];
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
      errors?: string[];
      title?: string;
      detail?: string;
    };

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors;
    }

    return [body.detail ?? body.title ?? response.statusText];
  } catch {
    return [response.statusText || "Request failed."];
  }
}

async function apiFetch<TResponse>(
  path: string,
  body: unknown,
  options: RequestOptions = {},
) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errors = await readResponseError(response);
    throw new ApiError(errors[0] ?? "Request failed.", response.status, errors);
  }

  return (await response.json()) as TResponse;
}

export function createUser(input: {
  email: string;
  password: string;
  displayName: string;
}) {
  return apiFetch<AuthSession>("/api/auth/users", input);
}

export function login(input: { email: string; password: string }) {
  return apiFetch<AuthSession>("/api/auth/login", input);
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
  return apiFetch<ExpenseInputResponse>("/api/expenses/input", input, {
    accessToken,
  });
}
