import type { AssistantResponse, AuthSession, CategoryCatalog, FinancialAccount, FinancialEventIntent, Transaction, TransactionIntent, TransactionPage, TransactionPatch, UserSettings } from "./models.ts";
import type { RegistrationPolicy, SignupInput, SignupInvitation } from "./workspace-models.ts";

export type HttpRequest = { path: string; method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; headers?: Record<string, string> };
export type HttpResponse = { status: number; data: unknown };
export type Transport = (request: HttpRequest) => Promise<HttpResponse>;
export class ApiError extends Error {
  status: number;
  outcome: "rejected" | "unknown";
  constructor(message: string, status = 0, outcome: "rejected" | "unknown" = "rejected") {
    super(message); this.name = "ApiError"; this.status = status; this.outcome = outcome;
  }
}
export class SessionChangedError extends Error {
  constructor() { super("The signed-in session changed. Please try again."); this.name = "SessionChangedError"; }
}
export type SessionState = { status: "signedOut" | "loading" | "authenticated" | "unavailable"; session: AuthSession | null };

function errorText(data: unknown): string {
  if (!data || typeof data !== "object") return "The request could not be completed.";
  const body = data as { errors?: unknown; detail?: unknown; title?: unknown; error?: unknown };
  const errors = body.errors;
  if (Array.isArray(errors) && typeof errors[0] === "string") return errors[0];
  if (errors && typeof errors === "object") {
    const first = Object.values(errors).flat().find(e => typeof e === "string");
    if (typeof first === "string") return first;
  }
  const text = [body.detail, body.title, body.error].find(v => typeof v === "string");
  return typeof text === "string" ? text : "The request could not be completed.";
}
function isSession(value: unknown): value is AuthSession {
  const s = value as AuthSession | null;
  return !!s && typeof s.accessToken === "string" && s.accessToken.length > 0
    && typeof s.accessTokenExpiresAt === "string" && Number.isFinite(Date.parse(s.accessTokenExpiresAt))
    && typeof s.user?.id === "string" && typeof s.user?.displayName === "string" && typeof s.requiresPrivacyConsent === "boolean";
}
export function isTransaction(value: unknown): value is Transaction {
  const t = value as Transaction | null;
  return !!t && typeof t.id === "string" && t.id.length > 0 && typeof t.amount === "number"
    && Number.isFinite(t.amount) && t.amount > 0 && typeof t.transactionDate === "string"
    && typeof t.currencyCode === "string" && ["Expense", "Income", "Transfer", "Investment"].includes(t.type);
}
const isAccount = (a: FinancialAccount | null) => !!a && typeof a.id === 'string' && !!a.id
  && typeof a.householdId === 'string' && typeof a.name === 'string' && typeof a.isActive === 'boolean'
  && typeof a.currencyCode === 'string' && /^[A-Z]{3}$/.test(a.currencyCode)
  && ['BankAccount', 'CreditCard', 'Cash', 'Wallet'].includes(a.accountType);
function validSettings(value: UserSettings | null): value is UserSettings {
  if (!value || typeof value.userProfileId !== 'string' || typeof value.displayName !== 'string'
    || typeof value.email !== 'string' || typeof value.currencyCode !== 'string' || !/^[A-Z]{3}$/.test(value.currencyCode)
    || typeof value.timeZone !== 'string' || !['Free', 'Premium'].includes(value.plan)
    || typeof value.requireMerchantForExpenses !== 'boolean' || !['Private', 'Household'].includes(value.defaultTransactionVisibility)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }); return true; } catch { return false; }
}

export class FinanceClient {
  private transport: Transport;
  private clearLocalSession: () => Promise<void>;
  private state: SessionState = { status: "signedOut", session: null };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private refreshFlight: Promise<AuthSession> | null = null;
  private authTail: Promise<unknown> = Promise.resolve();

  constructor(transport: Transport, clearLocalSession: () => Promise<void>) {
    this.transport = transport; this.clearLocalSession = clearLocalSession;
  }
  getSnapshot = (): SessionState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: SessionState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private serializeAuth<T>(work: () => Promise<T>): Promise<T> {
    const result = this.authTail.then(work, work);
    this.authTail = result.catch(() => undefined);
    return result;
  }
  private async raw(request: HttpRequest): Promise<unknown> {
    let response: HttpResponse;
    try { response = await this.transport(request); }
    catch { throw new ApiError("The connection was interrupted. Check your connection and try again.", 0, request.method === "GET" ? "rejected" : "unknown"); }
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(errorText(response.data), response.status,
        request.method !== "GET" && (response.status >= 500 || response.status === 408) ? "unknown" : "rejected");
    }
    return response.data;
  }

  login(email: string, password: string): Promise<AuthSession> {
    return this.authenticate('/api/auth/login', { email: email.trim(), password });
  }
  signup(input: SignupInput): Promise<AuthSession> {
    return this.authenticate('/api/auth/users', { ...input, email: input.email.trim() });
  }
  registration() { return this.raw({ path: '/api/auth/registration', method: 'GET' }) as Promise<RegistrationPolicy>; }
  validateInvitation(token: string) { return this.raw({ path: '/api/auth/signup-invitations/validate', method: 'POST', body: { token } }) as Promise<SignupInvitation>; }
  requestAccess(input: { name: string; email: string; reason?: string }) {
    return this.raw({ path: '/api/auth/access-requests', method: 'POST', body: input });
  }
  privacyPolicy() { return this.raw({ path: '/api/public/privacy', method: 'GET' }) as Promise<{ version: string; effectiveDate: string; policyUrl: string; supportEmail: string }>; }
  private async authenticate(path: string, body: unknown): Promise<AuthSession> {
    const epoch = ++this.epoch;
    this.publish({ status: "loading", session: null });
    return this.serializeAuth(async () => {
      try {
        // A different sign-in must not inherit the previous user's refresh cookie.
        await this.clearLocalSession();
        const session = await this.raw({ path, method: "POST", body });
        if (epoch !== this.epoch) throw new SessionChangedError();
        if (!isSession(session)) throw new ApiError("The server returned an invalid sign-in response.");
        this.publish({ status: "authenticated", session });
        return session;
      } catch (error) {
        if (epoch === this.epoch) this.publish({ status: "signedOut", session: null });
        throw error;
      }
    });
  }
  async restore(): Promise<void> {
    this.publish({ status: "loading", session: null });
    try { await this.refresh(); }
    catch (error) {
      if (error instanceof SessionChangedError) return;
      if (this.state.status !== "signedOut") this.publish({ status: "unavailable", session: null });
      throw error;
    }
  }
  refresh(): Promise<AuthSession> {
    if (this.refreshFlight) return this.refreshFlight;
    const epoch = this.epoch;
    const flight = this.serializeAuth(async () => {
      try {
        const session = await this.raw({ path: "/api/auth/refresh", method: "POST" });
        if (epoch !== this.epoch) throw new SessionChangedError();
        if (!isSession(session)) throw new ApiError("The server returned an invalid session response.");
        this.publish({ status: "authenticated", session });
        return session;
      } catch (error) {
        if (epoch === this.epoch && error instanceof ApiError && error.status === 401) {
          await this.clearLocalSession();
          ++this.epoch;
          this.publish({ status: "signedOut", session: null });
        }
        throw error;
      }
    });
    this.refreshFlight = flight;
    void flight.finally(() => { if (this.refreshFlight === flight) this.refreshFlight = null; }).catch(() => undefined);
    return flight;
  }
  async logout(): Promise<void> {
    ++this.epoch;
    this.publish({ status: "signedOut", session: null });
    await this.serializeAuth(async () => {
      try { await this.raw({ path: "/api/auth/logout", method: "POST" }); }
      finally { await this.clearLocalSession(); }
    });
  }
  async request<T>(path: string, method: HttpRequest["method"] = "GET", body?: unknown, headers?: Record<string, string>): Promise<T> {
    if (!path.startsWith("/api/") || path.includes("://") || path.includes("..")) throw new ApiError("Invalid API path.");
    const epoch = this.epoch;
    let session = this.state.session;
    if (!session) throw new ApiError("Please sign in again.", 401);
    if (Date.parse(session.accessTokenExpiresAt) <= Date.now() + 30000) session = await this.refresh();
    if (epoch !== this.epoch) throw new SessionChangedError();
    const send = (token: string) => this.raw({ path, method, body, headers: { ...headers, Authorization: `Bearer ${token}` } });
    let result: unknown;
    try { result = await send(session.accessToken); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || epoch !== this.epoch) throw error;
      const current = this.state.session;
      const renewed = current && current.accessToken !== session.accessToken ? current : await this.refresh();
      if (epoch !== this.epoch) throw new SessionChangedError();
      result = await send(renewed.accessToken);
    }
    if (epoch !== this.epoch) {
      if (method !== 'GET') throw new ApiError('The session changed while saving. Check the transaction before starting another.', 0, 'unknown');
      throw new SessionChangedError();
    }
    return result as T;
  }
  async categories(householdId?: string): Promise<CategoryCatalog> {
    const value = await this.request<CategoryCatalog>(`/api/categories${householdId ? `?householdId=${encodeURIComponent(householdId)}` : ''}`);
    if (!value || typeof value.householdId !== 'string' || (householdId && value.householdId !== householdId)
      || typeof value.canWrite !== 'boolean' || !Array.isArray(value.categories) || !value.categories.every(c => c && typeof c.id === 'string'
        && typeof c.name === 'string' && ['Expense', 'Income'].includes(c.type) && typeof c.isHidden === 'boolean'
        && (c.parentCategoryId === null || typeof c.parentCategoryId === 'string') && Number.isFinite(c.sortOrder))) {
      throw new ApiError('Your category data could not be verified. Refresh before entering a transaction.');
    }
    return value;
  }
  async accounts(householdId?: string): Promise<FinancialAccount[]> {
    const value = await this.request<FinancialAccount[]>(`/api/financial-accounts${householdId ? `?householdId=${encodeURIComponent(householdId)}` : ''}`);
    if (!Array.isArray(value) || !value.every(a => isAccount(a) && (!householdId || a.householdId === householdId))) {
      throw new ApiError('Your account data could not be verified. Refresh before entering a transaction.');
    }
    return value;
  }
  async settings(): Promise<UserSettings> {
    const value = await this.request<UserSettings>('/api/settings/me');
    if (!validSettings(value)) throw new ApiError('Your currency and time-zone settings could not be verified. Refresh before entering a transaction.');
    return value;
  }
  async transactions(month: string, page = 1, householdId?: string): Promise<TransactionPage> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(page) || page < 1) throw new ApiError('Choose a valid transaction month and page.');
    const value = await this.request<TransactionPage>(`/api/transactions?month=${encodeURIComponent(month)}&page=${page}&pageSize=30${householdId ? `&householdId=${encodeURIComponent(householdId)}` : ''}`);
    if (!value || value.month !== month || value.page !== page || !Number.isSafeInteger(value.pageSize) || value.pageSize < 1
      || !Number.isSafeInteger(value.totalCount) || value.totalCount < 0 || !Number.isSafeInteger(value.totalPages) || value.totalPages < 0
      || !Array.isArray(value.items) || value.items.length > value.pageSize || !value.items.every(t => isTransaction(t) && (!householdId || t.householdId === householdId))) {
      throw new ApiError('Your transaction history could not be verified. Refresh to load the saved records.');
    }
    return value;
  }
  async createTransaction(intent: Readonly<TransactionIntent>): Promise<Transaction> {
    const value = await this.request<unknown>("/api/transactions", "POST", intent);
    if (!isTransaction(value) || value.amount !== intent.amount || value.kind !== intent.eventKind
      || value.accountId !== intent.accountId || value.categoryId !== intent.categoryId || value.householdId !== intent.householdId
      || value.transactionDate.slice(0, 10) !== intent.date) throw new ApiError("The save response could not be verified. Retry the same transaction reference.", 0, "unknown");
    return value;
  }
  async updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction> {
    const value = await this.request<unknown>(`/api/transactions/${encodeURIComponent(id)}`, "PATCH", patch);
    if (!isTransaction(value) || value.id !== id) throw new ApiError("The update response could not be verified. Check the saved transaction.", 0, "unknown");
    return value;
  }
  async createFinancialEvent(intent: Readonly<FinancialEventIntent>): Promise<Transaction> {
    const value = await this.request<unknown>('/api/transactions', 'POST', intent);
    if (!isTransaction(value) || value.amount !== intent.amount || value.kind !== intent.eventKind
      || value.accountId !== intent.accountId || value.householdId !== intent.householdId
      || (value.counterpartyAccountId ?? null) !== (intent.counterpartyAccountId ?? null)
      || (intent.categoryId && value.categoryId !== intent.categoryId)
      || value.transactionDate.slice(0, 10) !== intent.date) throw new ApiError('The financial event response could not be verified. Check the saved event before another change.', 0, 'unknown');
    return value;
  }
  async sendAssistant(text: string, currencyCode: string, transactionDate: string, options: { inputMode?: 'Text' | 'Voice'; householdId?: string } = {}): Promise<AssistantResponse> {
    if (!text.trim() || text.length > 4000) throw new ApiError("Enter a message of up to 4000 characters.");
    const value = await this.request<AssistantResponse>("/api/assistant/messages", "POST", { text: text.trim(), inputMode: options.inputMode ?? "Text", currencyCode, transactionDate, locale: "en-IN", ...(options.householdId ? { householdId: options.householdId } : {}) });
    if (!value || !["Responded", "NeedsClarification", "Unsupported", "Failed"].includes(value.status)
      || (value.transaction !== null && !isTransaction(value.transaction))) {
      throw new ApiError("The assistant response could not be verified. Check recent transactions before sending again.", 0, "unknown");
    }
    return value;
  }
  async createAccount(name: string, accountType: FinancialAccount["accountType"]) {
    const account = await this.request<FinancialAccount>("/api/financial-accounts", "POST", {
      householdId: null, name: name.trim(), accountType, institution: null, last4: null,
      aliases: [], shared: false, isActive: true,
    });
    if (!account || typeof account.id !== 'string' || !account.id || typeof account.householdId !== 'string'
      || typeof account.name !== 'string' || !['BankAccount', 'CreditCard', 'Cash', 'Wallet'].includes(account.accountType)
      || typeof account.currencyCode !== 'string' || typeof account.isActive !== 'boolean') {
      throw new ApiError('The account response could not be verified. Check the account list before creating another.', 0, 'unknown');
    }
    return account;
  }
  acceptPrivacy(policyVersion: string) {
    return this.request("/api/privacy/consents", "POST", { policyVersion, accepted: true });
  }
}
