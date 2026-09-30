import type { SpeechDeviceCapabilities } from "./capabilities.ts";

export interface SpeechModelManifest {
  id: string;
  displayName: string;
  version: string;
  runtime: string;
  runtimeVersion: string;
  languages: readonly string[];
  streaming: boolean;
  minimumMemoryGb?: number;
  requiresWebGpu?: boolean;
  files: readonly { path: string; url: string; bytes: number; sha256: string }[];
}

export interface StoredSpeechModel { manifest: SpeechModelManifest; installedAt: string }
export interface ModelDownload { bytes: Uint8Array; etag?: string }
export interface SpeechModelStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
  list<T>(prefix: string): Promise<T[]>;
}

function prefix(manifest: SpeechModelManifest) { return `model/${encodeURIComponent(manifest.id)}/${encodeURIComponent(manifest.version)}/`; }
function validateManifest(manifest: SpeechModelManifest) {
  if (!manifest.id || !manifest.version || !manifest.runtime || !manifest.runtimeVersion || !manifest.files.length) throw new Error("Model manifest is incomplete.");
  const paths = new Set<string>();
  for (const file of manifest.files) {
    if (!file.path || paths.has(file.path) || file.path.split("/").some(part => part === ".." || !part) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/i.test(file.sha256) || new URL(file.url).protocol !== "https:") throw new Error("Model files require unique paths, HTTPS URLs, byte sizes and SHA-256 hashes.");
    paths.add(file.path);
  }
}

export class SpeechModelManager {
  private storage: SpeechModelStorage;
  private request: typeof fetch;
  private busy = false;
  private maximumModelBytes: number;
  constructor(storage: SpeechModelStorage, request: typeof fetch = fetch, maximumModelBytes = 256 * 1024 * 1024) {
    this.storage = storage; this.request = request; this.maximumModelBytes = maximumModelBytes;
  }

  getInstalledModels() { return this.storage.list<StoredSpeechModel>("installed/"); }
  async isModelInstalled(manifest: SpeechModelManifest) {
    const stored = await this.storage.get<StoredSpeechModel>(`installed/${prefix(manifest)}`);
    return !!stored && JSON.stringify(stored.manifest) === JSON.stringify(manifest);
  }
  getCompatibleModels(manifests: readonly SpeechModelManifest[], capabilities: SpeechDeviceCapabilities) {
    return manifests.filter(model => capabilities.secureContext && capabilities.audioCapture && capabilities.audioWorklet && capabilities.wasm && capabilities.persistentModelStorage
      && (!model.requiresWebGpu || capabilities.webGpu)
      && (!model.minimumMemoryGb || (capabilities.memoryGb !== undefined && capabilities.memoryGb >= model.minimumMemoryGb)));
  }

  async downloadModel(manifest: SpeechModelManifest, options: { signal?: AbortSignal; onProgress?: (downloaded: number, total: number) => void } = {}) {
    validateManifest(manifest);
    if (manifest.files.reduce((total, file) => total + file.bytes, 0) > this.maximumModelBytes) throw new Error("This model exceeds the runtime's supported model size budget. Use a smaller model.");
    if (this.busy) throw new Error("Another model operation is in progress.");
    this.busy = true;
    const base = prefix(manifest);
    try {
      if (await this.isModelInstalled(manifest)) return;
      await this.storage.removePrefix(`installed/${base}`);
      const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
      let completed = 0;
      for (const file of manifest.files) {
        options.signal?.throwIfAborted();
        const key = `${base}file/${file.path}`;
        const expected = `${base}expected/${file.path}`;
        const previous = await this.storage.get<string>(expected);
        let saved = previous === file.sha256 ? await this.storage.get<ModelDownload>(key) : undefined;
        await this.storage.put(expected, file.sha256);
        if (saved && saved.bytes.length > file.bytes) saved = undefined;
        if (!saved || saved.bytes.length < file.bytes) {
          const offset = saved?.bytes.length ?? 0;
          const headers: Record<string, string> = {};
          if (offset) { headers.Range = `bytes=${offset}-`; if (saved?.etag) headers["If-Range"] = saved.etag; }
          const response = await this.request(file.url, { headers, signal: options.signal, credentials: "omit" });
          if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status}).`);
          const resumed = offset > 0 && response.status === 206;
          if (response.status === 206 && (!resumed || !response.headers.get("Content-Range")?.startsWith(`bytes ${offset}-`) || (saved?.etag && response.headers.get("ETag") !== saved.etag))) throw new Error("Invalid resumed model response.");
          let bytes = resumed ? saved!.bytes : new Uint8Array();
          let chunks: Uint8Array[] = [];
          let received = bytes.length;
          const flush = () => {
            if (!chunks.length) return;
            const next = new Uint8Array(received);
            next.set(bytes);
            let position = bytes.length;
            for (const chunk of chunks) { next.set(chunk, position); position += chunk.length; }
            bytes = next;
            chunks = [];
          };
          const etag = response.headers.get("ETag") ?? undefined;
          const reader = response.body.getReader();
          let checkpoint = bytes.length;
          try {
            while (true) {
              options.signal?.throwIfAborted();
              const { done, value } = await reader.read();
              if (done) break;
              if (received + value.length > file.bytes) throw new Error("Model file exceeds its manifest size.");
              chunks.push(value); received += value.length;
              options.onProgress?.(completed + received, total);
              if (received - checkpoint >= 4 * 1024 * 1024) { flush(); await this.storage.put(key, { bytes, etag }); checkpoint = received; }
            }
          } finally {
            await reader.cancel().catch(() => {});
            flush();
            // Save partial bytes for a later explicit retry, including cancellation.
            await this.storage.put(key, { bytes, etag });
          }
          saved = { bytes, etag };
        }
        if (saved.bytes.length !== file.bytes || await sha256(saved.bytes) !== file.sha256.toLowerCase()) {
          await this.storage.removePrefix(key);
          throw new Error("Model file failed integrity verification. Download it again.");
        }
        completed += file.bytes;
        options.onProgress?.(completed, total);
      }
      options.signal?.throwIfAborted();
      await this.storage.put(`installed/${base}`, { manifest, installedAt: new Date().toISOString() });
    } finally { this.busy = false; }
  }

  async verifyModel(manifest: SpeechModelManifest) {
    validateManifest(manifest);
    for (const file of manifest.files) {
      const saved = await this.storage.get<ModelDownload>(`${prefix(manifest)}file/${file.path}`);
      if (!saved || saved.bytes.length !== file.bytes || await sha256(saved.bytes) !== file.sha256.toLowerCase()) return false;
    }
    return true;
  }
  async loadModel(manifest: SpeechModelManifest) {
    if (!await this.isModelInstalled(manifest) || !await this.verifyModel(manifest)) throw new Error("Install and verify this model before loading it.");
    return Promise.all(manifest.files.map(async file => ({ path: file.path, bytes: (await this.storage.get<ModelDownload>(`${prefix(manifest)}file/${file.path}`))!.bytes })));
  }
  async deleteModel(manifest: SpeechModelManifest) {
    if (this.busy) throw new Error("Wait for the current model download to finish or cancel it.");
    this.busy = true;
    try {
      await this.storage.removePrefix(`installed/${prefix(manifest)}`);
      await this.storage.removePrefix(prefix(manifest));
    } finally { this.busy = false; }
  }
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
