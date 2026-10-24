import { ApiError } from '../../../../packages/finance-core/src/client.ts';
import type { SecureJsonStore } from './secure-json';

export type PendingWrite = { version: 1; ownerId: string; label: string; startedAt: string; householdId?: string };
export type WriteGuardState = { ready: boolean; busy: boolean; pending: PendingWrite | null; error: string | null };

/** Durable boundary for endpoints without a transaction reference/idempotency API. */
export class WriteGuard {
  private vault: SecureJsonStore;
  private ownerId: string;
  private listeners = new Set<() => void>();
  private state: WriteGuardState = { ready: false, busy: false, pending: null, error: null };
  private active = false;
  constructor(vault: SecureJsonStore, ownerId: string) { this.vault = vault; this.ownerId = ownerId; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<WriteGuardState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  async restore() {
    try {
      const value = await this.vault.get();
      if (value !== null) {
        const pending = value as Partial<PendingWrite>;
        if (pending.version !== 1 || pending.ownerId !== this.ownerId || typeof pending.label !== 'string'
          || pending.label.length > 160 || typeof pending.startedAt !== 'string'
          || (pending.householdId !== undefined && (typeof pending.householdId !== 'string' || !pending.householdId))) throw Error('Unrecognized operation record.');
      }
      this.publish({ ready: true, pending: value as PendingWrite | null, error: null });
    } catch { this.publish({ ready: false, error: 'The saved operation could not be checked securely. Retry before making another change.' }); }
  }
  async run<T>(label: string, work: () => Promise<T>, householdId?: string): Promise<T> {
    if (!this.state.ready || this.active || this.state.pending) throw new ApiError('Review the pending change before starting another.');
    this.active = true; this.publish({ busy: true, error: null });
    const pending: PendingWrite = { version: 1, ownerId: this.ownerId, label: label.slice(0, 160), startedAt: new Date().toISOString(), ...(householdId ? { householdId } : {}) };
    try {
      // Failure here must prevent the network call entirely.
      try { await this.vault.put(pending); }
      catch { throw new ApiError('The change could not be recorded securely. Free device storage and try again.'); }
      this.publish({ pending });
      let result: T;
      try { result = await work(); }
      catch (error) {
        if (error instanceof ApiError && error.outcome === 'rejected') {
          await this.vault.remove(); this.publish({ pending: null });
        }
        throw error;
      }
      // An acknowledged server write stays successful even if local cleanup fails.
      try { await this.vault.remove(); this.publish({ pending: null }); }
      catch { this.publish({ error: 'The change is saved. Its device operation record still needs clearing before another change.' }); }
      return result;
    } finally { this.active = false; this.publish({ busy: false }); }
  }
  /** Only invoke after the user explicitly reviews the saved server data. */
  async acknowledgeReview() {
    if (this.active) throw Error('Wait for the current change to finish.');
    await this.vault.remove(); this.publish({ pending: null, error: null });
  }
}
