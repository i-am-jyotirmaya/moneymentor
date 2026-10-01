import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { installSpeechRuntime, loadSpeechRuntime, deleteSpeechRuntime } from "../src/runtime-assets.ts";
import { speechRuntimeId } from "../src/catalog.ts";
import type { SpeechModelStorage } from "../src/models.ts";

class Storage implements SpeechModelStorage {
  data = new Map<string, unknown>();
  async get<T>(key: string) { return this.data.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.data.set(key, value); }
  async removePrefix(prefix: string) { for (const key of this.data.keys()) if (key.startsWith(prefix)) this.data.delete(key); }
  async list<T>(prefix: string) { return [...this.data].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value as T); }
}
const bytes = new Uint8Array([1, 2, 3]);
const names = ["worker.js", "pcm-worklet.js", "licenses.txt", "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"];
const manifest = { id: speechRuntimeId, files: names.map(path => ({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })) };
const request: typeof fetch = async url => String(url).endsWith("runtime.json") ? Response.json(manifest) : new Response(bytes);

test("all inference assets persist, verify on offline load, and delete together", async () => {
  const storage = new Storage();
  await installSpeechRuntime(storage, "/speech/test", { request });
  assert.deepEqual(Object.keys(await loadSpeechRuntime(storage)), names);
  const key = [...storage.data.keys()].find(key => key.endsWith("worker.js"))!;
  await storage.put(key, new Uint8Array([9, 9, 9]));
  await assert.rejects(loadSpeechRuntime(storage), /damaged/);
  await installSpeechRuntime(storage, "/speech/test", { request });
  assert.deepEqual((await loadSpeechRuntime(storage))["worker.js"], bytes);
  await deleteSpeechRuntime(storage);
  await assert.rejects(loadSpeechRuntime(storage), /Download/);
});

test("invalid runtime paths, versions and corrupt bytes cannot be installed", async () => {
  const storage = new Storage();
  for (const invalid of [{ ...manifest, id: "other" }, { ...manifest, files: manifest.files.slice(1) }, { ...manifest, files: [...manifest.files.slice(1), manifest.files[1]] }]) {
    await assert.rejects(installSpeechRuntime(storage, "/speech/test", { request: async () => Response.json(invalid) }), /Invalid/);
  }
  await assert.rejects(installSpeechRuntime(storage, "/speech/test", { request: async url => String(url).endsWith("runtime.json") ? Response.json(manifest) : new Response(new Uint8Array([9, 9, 9])) }), /integrity/);
  await assert.rejects(loadSpeechRuntime(storage), /Download/);
});

test("cancelled runtime installation reuses only fully verified completed assets", async () => {
  const storage = new Storage();
  const controller = new AbortController();
  let progressCalls = 0;
  await assert.rejects(installSpeechRuntime(storage, "/speech/test", { request, signal: controller.signal, onProgress: completed => { if (completed === bytes.length && ++progressCalls === 2) controller.abort(); } }), /abort/i);
  await assert.rejects(loadSpeechRuntime(storage), /Download/);
  let downloads = 0;
  await installSpeechRuntime(storage, "/speech/test", { request: async url => { if (!String(url).endsWith("runtime.json")) downloads++; return request(url); } });
  assert.equal(downloads, names.length - 1);
});
