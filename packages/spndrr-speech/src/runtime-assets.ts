import { speechRuntimeId } from "./catalog.ts";
import type { SpeechModelStorage } from "./models.ts";

const names = ["worker.js", "pcm-worklet.js", "licenses.txt", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"] as const;
interface RuntimeManifest { id: string; files: { path: string; bytes: number; sha256: string }[] }
const prefix = `runtime/${speechRuntimeId}/`;
const retiredPrefix = "runtime/whisper-wasm-v1-transformers-3.8.1/";
async function hash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)), v => v.toString(16).padStart(2, "0")).join("");
}
function validate(manifest: RuntimeManifest) {
  if (manifest.id !== speechRuntimeId || manifest.files.length !== names.length ||
    names.some(name => manifest.files.filter(file => file.path === name).length !== 1) ||
    manifest.files.some(file => !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) ||
    manifest.files.reduce((total, file) => total + file.bytes, 0) > 96 * 1048576) throw new Error("Invalid local speech runtime.");
}

/** Only called on an explicit install. Assets come from the app's own origin, never a CDN. */
export async function installSpeechRuntime(storage: SpeechModelStorage, baseUrl: string, options: {
  signal?: AbortSignal; onProgress?: (bytes: number, total: number) => void; request?: typeof fetch;
} = {}) {
  const request = options.request ?? fetch;
  const response = await request(`${baseUrl}/runtime.json`, { signal: options.signal, credentials: "omit" });
  if (!response.ok) throw new Error("The local speech runtime is unavailable. Reload the app and try again.");
  const manifest = await response.json() as RuntimeManifest;
  validate(manifest);
  let completed = 0;
  const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  for (const file of manifest.files) {
    options.signal?.throwIfAborted();
    let bytes = await storage.get<Uint8Array>(prefix + file.path);
    if (!bytes || bytes.length !== file.bytes || await hash(bytes) !== file.sha256) {
      const response = await request(`${baseUrl}/${file.path}`, { signal: options.signal, credentials: "omit" });
      if (!response.ok || !response.body) throw new Error("Local speech runtime download failed.");
      const reader = response.body.getReader();
      bytes = new Uint8Array(file.bytes);
      let received = 0;
      try {
        while (true) {
          options.signal?.throwIfAborted();
          const { value, done } = await reader.read();
          if (done) break;
          if (received + value.length > bytes.length) throw new Error("Runtime file exceeds its expected size.");
          bytes.set(value, received); received += value.length;
          options.onProgress?.(completed + received, total);
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (received !== file.bytes || await hash(bytes) !== file.sha256) throw new Error("Local speech runtime failed integrity verification.");
      await storage.put(prefix + file.path, bytes);
    }
    completed += file.bytes;
    options.onProgress?.(completed, total);
  }
  options.signal?.throwIfAborted();
  await storage.put(prefix + "manifest", manifest);
  // Remove the superseded runtime only after the replacement is fully installed.
  await storage.removePrefix(retiredPrefix);
}

export async function loadSpeechRuntime(storage: SpeechModelStorage) {
  const manifest = await storage.get<RuntimeManifest>(prefix + "manifest");
  if (!manifest) throw new Error("Download the local speech runtime before recording.");
  validate(manifest);
  const result: Record<string, Uint8Array> = {};
  for (const file of manifest.files) {
    const bytes = await storage.get<Uint8Array>(prefix + file.path);
    if (!bytes || bytes.length !== file.bytes || await hash(bytes) !== file.sha256) throw new Error("Local speech runtime is missing or damaged. Reinstall it.");
    result[file.path] = bytes;
  }
  return result;
}

export async function deleteSpeechRuntime(storage: SpeechModelStorage) {
  await storage.removePrefix(prefix);
  await storage.removePrefix(retiredPrefix);
}

export async function isSpeechRuntimeInstalled(storage: SpeechModelStorage) {
  const manifest = await storage.get<RuntimeManifest>(prefix + "manifest");
  if (!manifest) return false;
  try { validate(manifest); return true; } catch { return false; }
}
