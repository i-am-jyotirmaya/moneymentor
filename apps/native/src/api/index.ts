import { clearTokens, setAccessToken } from "../auth/token-storage";
import { FinanceClient } from "./client";
import type { SignupInput } from "./workspace-models";
import { createTransport } from "./transport";

// Serialize secure-store changes so a slow sign-in write cannot resurrect a
// signed-out token. Auth methods resolve only once their storage changes finish.
class NativeFinanceClient extends FinanceClient {
  private storage: Promise<void> = Promise.resolve();

  constructor(baseUrl?: string) {
    super(createTransport(baseUrl), () => this.enqueue(clearTokens));
    this.subscribe(() => {
      const { status, session } = this.getSnapshot();
      if (status === "authenticated" && session) {
        void this.enqueue(() => setAccessToken(session.accessToken));
      } else if (status === "signedOut") {
        void this.enqueue(clearTokens);
      }
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    this.storage = this.storage.then(work, work);
    // Keep subscription callbacks synchronous; auth methods surface failures.
    void this.storage.catch(() => undefined);
    return this.storage;
  }

  override async login(email: string, password: string) {
    try { return await super.login(email, password); }
    finally { await this.storage; }
  }
  override async signup(input: SignupInput) {
    try { return await super.signup(input); }
    finally { await this.storage; }
  }
  override async refresh() {
    try { return await super.refresh(); }
    finally { await this.storage; }
  }
  override async logout() {
    try { await super.logout(); }
    finally { await this.storage; }
  }
}

export function createFinanceClient(baseUrl?: string): FinanceClient {
  return new NativeFinanceClient(baseUrl);
}
