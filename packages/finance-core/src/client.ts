import type { AssistantResponse, AuthSession, CategoryCatalog, FinancialAccount, Transaction, TransactionIntent, TransactionPage, TransactionPatch, UserSettings } from "./models.ts";

export type HttpRequest = { path: string; method: "GET" | "POST" | "PATCH"; body?: unknown; headers?: Record<string, string> };
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

  async login(email: string, password: string): Promise<AuthSession> {
    const epoch = ++this.epoch;
    this.publish({ status: "loading", session: null });
    return this.serializeAuth(async () => {
      try {
        // A different sign-in must not inherit the previous user's refresh cookie.
        await this.clearLocalSession();
        const session = await this.raw({ path: "/api/auth/login", method: "POST", body: { email: email.trim(), password } });
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
  async request<T>(path: string, method: HttpRequest["method"] = "GET", body?: unknown): Promise<T> {
    if (!path.startsWith("/api/") || path.includes("://") || path.includes("..")) throw new ApiError("Invalid API path.");
    const epoch = this.epoch;
    let session = this.state.session;
    if (!session) throw new ApiError("Please sign in again.", 401);
    if (Date.parse(session.accessTokenExpiresAt) <= Date.now() + 30000) session = await this.refresh();
    if (epoch !== this.epoch) throw new SessionChangedError();
    const send = (token: string) => this.raw({ path, method, body, headers: { Authorization: `Bearer ${token}` } });
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
  categories() { return this.request<CategoryCatalog>("/api/categories"); }
  accounts() { return this.request<FinancialAccount[]>("/api/financial-accounts"); }
  settings() { return this.request<UserSettings>("/api/settings/me"); }
  transactions(month: string, page = 1) {
    return this.request<TransactionPage>(`/api/transactions?month=${encodeURIComponent(month)}&page=${page}&pageSize=30`);
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
  async sendAssistant(text: string, currencyCode: string, transactionDate: string): Promise<AssistantResponse> {
    if (!text.trim() || text.length > 4000) throw new ApiError("Enter a message of up to 4000 characters.");
    const value = await this.request<AssistantResponse>("/api/assistant/messages", "POST", { text: text.trim(), inputMode: "Text", currencyCode, transactionDate, locale: "en-IN" });
    if (!value || !["Responded", "NeedsClarification", "Unsupported", "Failed"].includes(value.status)
      || (value.transaction !== null && !isTransaction(value.transaction))) {
      throw new ApiError("The assistant response could not be verified. Check recent transactions before sending again.", 0, "unknown");
    }
    return value;
  }
  createAccount(name: string, accountType: FinancialAccount["accountType"]) {
    return this.request<FinancialAccount>("/api/financial-accounts", "POST", {
      householdId: null, name: name.trim(), accountType, institution: null, last4: null,
      aliases: [], shared: false, isActive: true,
    });
  }
  acceptPrivacy(policyVersion: string) {
    return this.request("/api/privacy/consents", "POST", { policyVersion, accepted: true });
  }
}
