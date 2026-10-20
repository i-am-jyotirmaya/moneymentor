import type { SecureJsonStore } from './secure-json.ts';

/** Encrypted inventory makes account deletion remove previews from previously visited scopes. */
export class ScopeIndex {
  private tail: Promise<unknown> = Promise.resolve();
  private vault: SecureJsonStore;
  private ownerId: string;
  constructor(vault: SecureJsonStore, ownerId: string) { this.vault = vault; this.ownerId = ownerId; }
  async list(): Promise<string[]> {
    const value = await this.vault.get() as { version?: number; ownerId?: string; households?: unknown } | null;
    if (value === null) return [];
    if (value.version !== 1 || value.ownerId !== this.ownerId || !Array.isArray(value.households) || value.households.length > 100
      || !value.households.every(item => typeof item === 'string' && item.length > 0 && item.length <= 128)) throw Error('Saved household inventory could not be verified.');
    return [...new Set(value.households as string[])];
  }
  register(householdId: string): Promise<void> {
    const work = this.tail.then(async () => {
      const households = await this.list(); if (households.includes(householdId)) return;
      if (!householdId || householdId.length > 128 || households.length >= 100) throw Error('The device household inventory is full.');
      await this.vault.put({ version: 1, ownerId: this.ownerId, households: [...households, householdId] });
    });
    this.tail = work.catch(() => undefined); return work;
  }
  async clear() { await this.tail; await this.vault.remove(); }
}
