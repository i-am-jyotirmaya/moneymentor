import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SpeechModelManager } from "../src/index.ts";
import type { SpeechModelManifest, SpeechModelStorage } from "../src/index.ts";

class MemoryStorage implements SpeechModelStorage {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T) { this.values.set(key, value); }
  async removePrefix(prefix: string) { for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key); }
  async list<T>(prefix: string) { return [...this.values].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value as T); }
}
const audioModel = new Uint8Array([1, 2, 3, 4, 5, 6]);
function manifest(version = "1"): SpeechModelManifest {
  return { id: "test", displayName: "Test model", version, runtime: "test-runtime", runtimeVersion: "1", languages: ["en"], streaming: true,
    files: [{ path: "encoder.onnx", url: "https://models.example/encoder.onnx", bytes: audioModel.length, sha256: createHash("sha256").update(audioModel).digest("hex") }] };
}

test("models are installed only after verification, load offline, and keep versions separate", async () => {
  const storage = new MemoryStorage();
  let requests = 0;
  const manager = new SpeechModelManager(storage, async () => { requests++; return new Response(audioModel); });
  await manager.downloadModel(manifest());
  assert.equal(await manager.isModelInstalled(manifest()), true);
  assert.equal(await manager.verifyModel(manifest()), true);
  assert.deepEqual((await manager.loadModel(manifest()))[0].bytes, audioModel);
  await manager.downloadModel(manifest());
  assert.equal(requests, 1);
  await manager.downloadModel(manifest("2"));
  await manager.deleteModel(manifest());
  assert.equal(await manager.isModelInstalled(manifest()), false);
  assert.equal(await manager.isModelInstalled(manifest("2")), true);
});

test("corrupt model data never creates an installed marker", async () => {
  const storage = new MemoryStorage();
  const manager = new SpeechModelManager(storage, async () => new Response(new Uint8Array(6)));
  await assert.rejects(manager.downloadModel(manifest()), /integrity/);
  assert.equal(await manager.isModelInstalled(manifest()), false);
  assert.deepEqual(await manager.getInstalledModels(), []);
});

test("interrupted downloads resume with Range and ETag, and verify the combined bytes", async () => {
  const storage = new MemoryStorage();
  const first = new SpeechModelManager(storage, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(audioModel.slice(0, 3)); },
    pull(controller) { controller.error(new Error("network lost")); },
  }), { headers: { ETag: '"version-1"' } }));
  await assert.rejects(first.downloadModel(manifest()), /network lost/);
  assert.equal(await first.isModelInstalled(manifest()), false);
  const second = new SpeechModelManager(storage, async (_url, options) => {
    assert.equal((options?.headers as Record<string, string>).Range, "bytes=3-");
    assert.equal((options?.headers as Record<string, string>)["If-Range"], '"version-1"');
    return new Response(audioModel.slice(3), { status: 206, headers: { ETag: '"version-1"', "Content-Range": "bytes 3-5/6" } });
  });
  await second.downloadModel(manifest());
  assert.deepEqual((await second.loadModel(manifest()))[0].bytes, audioModel);
});

test("a server without Range support restarts the download safely", async () => {
  const storage = new MemoryStorage();
  storage.values.set("model/test/1/expected/encoder.onnx", manifest().files[0].sha256);
  storage.values.set("model/test/1/file/encoder.onnx", { bytes: audioModel.slice(0, 3) });
  const manager = new SpeechModelManager(storage, async () => new Response(audioModel));
  await manager.downloadModel(manifest());
  assert.equal(await manager.verifyModel(manifest()), true);
});

test("cancellation preserves partial bytes but never an installed marker", async () => {
  const storage = new MemoryStorage();
  const controller = new AbortController();
  const manager = new SpeechModelManager(storage, async () => new Response(audioModel));
  await assert.rejects(manager.downloadModel(manifest(), { signal: controller.signal, onProgress() { controller.abort(); } }), { name: "AbortError" });
  assert.equal(await manager.isModelInstalled(manifest()), false);
  assert.ok(await storage.get("model/test/1/file/encoder.onnx"));
});

test("manifests require pinned HTTPS assets and respect the memory limit", async () => {
  const manager = new SpeechModelManager(new MemoryStorage(), async () => { throw new Error("must not fetch"); }, 5);
  await assert.rejects(manager.downloadModel(manifest()), /model size/);
  const invalid = manifest();
  invalid.files = [{ ...invalid.files[0], url: "http://models.example/file" }];
  await assert.rejects(manager.downloadModel(invalid), /HTTPS/);
});

test("storage tampering is detected before model assets are loaded", async () => {
  const storage = new MemoryStorage();
  const manager = new SpeechModelManager(storage, async () => new Response(audioModel));
  await manager.downloadModel(manifest());
  storage.values.set("model/test/1/file/encoder.onnx", { bytes: new Uint8Array(6) });
  assert.equal(await manager.verifyModel(manifest()), false);
  await assert.rejects(manager.loadModel(manifest()), /verify/);
});
