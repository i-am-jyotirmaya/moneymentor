/** The backend MUST encrypt at rest (SecureStore). This class is platform neutral for fault tests. */
export type SecureBackend = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> };
const MAX_CHUNKS = 40;
type Manifest = { slot: 'a' | 'b'; count: number };

export class SecureJsonStore {
  private backend: SecureBackend;
  private key: string;
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  constructor(backend: SecureBackend, key: string) { this.backend = backend; this.key = key; }
  private run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => undefined);
    return next;
  }
  private async manifest(): Promise<Manifest | null> {
    const text = await this.backend.get(this.key);
    if (!text) return null;
    const value = JSON.parse(text) as Manifest;
    if (!['a', 'b'].includes(value.slot) || !Number.isInteger(value.count) || value.count < 1 || value.count > MAX_CHUNKS) throw Error('Invalid secure draft metadata.');
    return value;
  }
  get(): Promise<unknown> {
    return this.run(async () => {
      const meta = await this.manifest();
      if (!meta) return null;
      let json = '';
      for (let index = 0; index < meta.count; index++) {
        const chunk = await this.backend.get(`${this.key}.${meta.slot}.${index}`);
        if (chunk === null) throw Error('The encrypted draft is incomplete.');
        json += chunk;
      }
      return JSON.parse(json) as unknown;
    });
  }
  put(value: unknown): Promise<void> {
    if (this.closed) return Promise.reject(Error('This draft is closed.'));
    return this.run(async () => {
      if (this.closed) return;
      const previous = await this.manifest();
      const slot = previous?.slot === 'a' ? 'b' : 'a';
      // At most 1600 UTF-8 bytes per record, without splitting Unicode code points.
      const chars = Array.from(JSON.stringify(value));
      const chunks: string[] = [];
      for (let index = 0; index < chars.length; index += 400) chunks.push(chars.slice(index, index + 400).join(''));
      if (chunks.length > MAX_CHUNKS) throw Error('The encrypted draft is too large.');
      for (let index = 0; index < chunks.length; index++) await this.backend.set(`${this.key}.${slot}.${index}`, chunks[index]!);
      // Commit last: a crash during chunk writes leaves the previous draft readable.
      await this.backend.set(this.key, JSON.stringify({ slot, count: chunks.length }));
    });
  }
  remove(): Promise<void> {
    return this.run(async () => {
      await this.backend.remove(this.key);
      for (const slot of ['a', 'b']) for (let index = 0; index < MAX_CHUNKS; index++) await this.backend.remove(`${this.key}.${slot}.${index}`);
    });
  }
  async closeAndRemove(): Promise<void> { this.closed = true; await this.remove(); }
}
