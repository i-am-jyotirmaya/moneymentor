import test from "node:test";
import assert from "node:assert/strict";
import { LocalTranscriptionService, WorkerTranscriptionProvider } from "../src/index.ts";
import type { SpeechInferenceWorker, PcmAudioSource, SpeechModelManager, SpeechModelManifest, SpeechWorkerRequest, SpeechWorkerResponse } from "../src/index.ts";
import { SpeechWorkerPool } from "../src/worker-pool.ts";

const manifest: SpeechModelManifest = { id: "test", version: "1", displayName: "Test", runtime: "test", runtimeVersion: "1", languages: ["en"], streaming: true, files: [] };
const models = { async isModelInstalled() { return true; }, async loadModel() { return []; } } as unknown as SpeechModelManager;
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
class Capture implements PcmAudioSource {
  frame?: (pcm: Float32Array) => void;
  stopped = false;
  async start(_url: string, callback: (pcm: Float32Array) => void) { this.frame = callback; }
  async dispose() { this.stopped = true; }
}
class Worker implements SpeechInferenceWorker {
  onmessage: SpeechInferenceWorker["onmessage"] = null;
  onerror: SpeechInferenceWorker["onerror"] = null;
  requests: SpeechWorkerRequest[] = [];
  sessionId = "";
  terminated = false;
  autoReady = true;
  postMessage(message: SpeechWorkerRequest) {
    this.requests.push(message);
    this.sessionId = message.sessionId;
    if (message.type === "load" && this.autoReady) this.send({ type: "ready", sessionId: this.sessionId });
  }
  send(message: SpeechWorkerResponse) { this.onmessage?.({ data: message } as MessageEvent<SpeechWorkerResponse>); }
  terminate() { this.terminated = true; }
}

test("worker adapter ignores foreign sessions, applies backpressure, and unloads after final", async () => {
  const worker = new Worker();
  const capture = new Capture();
  const provider = new WorkerTranscriptionProvider({ id: "test", manifest, models, createWorker: () => worker, workletUrl: "/speech/pcm-worklet.js", capture });
  const events: string[] = [];
  const session = new LocalTranscriptionService(provider);
  const result = session.transcribe({ language: "en-IN", privacy: "local-only" }, event => events.push(event.type));
  await turn();
  capture.frame?.(new Float32Array(320).fill(0.1));
  capture.frame?.(new Float32Array(320).fill(0.1));
  assert.equal(worker.requests.filter(request => request.type === "audio").length, 1);
  worker.send({ type: "ack", sessionId: worker.sessionId, sequence: 0 });
  assert.equal(worker.requests.filter(request => request.type === "audio").length, 2);
  worker.send({ type: "event", sessionId: "old-session", event: { type: "final", text: "must not submit" } });
  worker.send({ type: "event", sessionId: worker.sessionId, event: { type: "partial", text: "spent" } });
  await turn();
  worker.send({ type: "event", sessionId: worker.sessionId, event: { type: "final", text: "spent 500" } });
  assert.equal((await result)?.text, "spent 500");
  assert.deepEqual(events, ["recording", "partial", "final"]);
  assert.equal(capture.stopped, true);
  assert.equal(worker.terminated, true);
});

test("cancellation during worker initialization terminates the worker without recording", async () => {
  const worker = new Worker(); worker.autoReady = false;
  const capture = new Capture();
  const session = new LocalTranscriptionService(new WorkerTranscriptionProvider({ id: "test", manifest, models, createWorker: () => worker, workletUrl: "/worklet", capture }));
  const result = session.transcribe({ language: "en-US", privacy: "local-only" });
  await turn();
  await session.cancel();
  assert.equal(await result, null);
  assert.equal(capture.frame, undefined);
  assert.equal(worker.terminated, true);
});

test("slow inference aborts instead of silently dropping queued audio", async () => {
  const worker = new Worker();
  const capture = new Capture();
  const session = new LocalTranscriptionService(new WorkerTranscriptionProvider({ id: "test", manifest, models, createWorker: () => worker, workletUrl: "/worklet", capture }));
  const result = session.transcribe({ language: "en-US", privacy: "local-only" });
  await turn();
  const rejected = assert.rejects(result, /cannot process speech/);
  for (let i = 0; i < 103; i++) capture.frame?.(new Float32Array(320));
  await rejected;
  assert.equal(capture.stopped, true);
  assert.equal(worker.terminated, true);
});

test("endpointing stops capture and flushes acknowledged audio before requesting a final", async () => {
  const worker = new Worker();
  const capture = new Capture();
  const session = new LocalTranscriptionService(new WorkerTranscriptionProvider({ id: "test", manifest, models, createWorker: () => worker, workletUrl: "/worklet", capture }));
  const result = session.transcribe({ language: "en-US", privacy: "local-only" });
  await turn();
  for (let sequence = 0; sequence < 22; sequence++) {
    capture.frame?.(new Float32Array(1600).fill(sequence < 2 ? 0.2 : 0));
    worker.send({ type: "ack", sessionId: worker.sessionId, sequence });
  }
  assert.equal(capture.stopped, true);
  assert.equal(worker.requests.at(-1)?.type, "finish");
  worker.send({ type: "event", sessionId: worker.sessionId, event: { type: "final", text: "spent 450 on dinner" } });
  assert.equal((await result)?.text, "spent 450 on dinner");
});

test("consecutive utterances reuse verified weights with fresh session IDs; cancelling destroys the warm decoder", async () => {
  const pool = new SpeechWorkerPool();
  const worker = new Worker();
  let loads = 0, creations = 0;
  const cachedModels = { ...models, async loadModel() { loads++; return [{ path: "model", bytes: new Uint8Array([1]) }]; } } as unknown as SpeechModelManager;
  const create = () => {
    const capture = new Capture();
    const service = new LocalTranscriptionService(new WorkerTranscriptionProvider({ id: "test", manifest, models: cachedModels, createWorker: () => { creations++; return worker; }, workerPool: pool, workletUrl: "/worklet", capture }));
    return { service, capture };
  };
  try {
    const first = create();
    const result = first.service.transcribe({ language: "en-US", privacy: "local-only" });
    await turn();
    const oldSession = worker.sessionId;
    worker.send({ type: "event", sessionId: oldSession, event: { type: "final", text: "first sentence" } });
    assert.equal((await result)?.text, "first sentence");
    assert.equal(worker.terminated, false);
    assert.equal(first.capture.stopped, true);
    const second = create();
    const pending = second.service.transcribe({ language: "en-US", privacy: "local-only" });
    await turn();
    assert.notEqual(worker.sessionId, oldSession);
    assert.equal(loads, 1);
    assert.equal(creations, 1);
    assert.deepEqual((worker.requests.at(-1) as Extract<SpeechWorkerRequest, { type: "load" }>).files, []);
    worker.send({ type: "event", sessionId: oldSession, event: { type: "final", text: "stale" } });
    await second.service.cancel();
    assert.equal(await pending, null);
    assert.equal(worker.terminated, true);
    assert.equal(second.capture.stopped, true);
  } finally { pool.clear(); }
});

test("idle decoder expires and a cache clear cannot retain a late factory result", async () => {
  const pool = new SpeechWorkerPool(10);
  const worker = new Worker();
  const lease = await pool.acquire(() => worker);
  lease.release(true);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(worker.terminated, true);
  const late = new Worker();
  let complete!: (worker: Worker) => void;
  const pending = pool.acquire(() => new Promise<Worker>(resolve => { complete = resolve; }));
  pool.clear();
  const rejection = assert.rejects(pending, /cancelled/);
  complete(late);
  await rejection;
  assert.equal(late.terminated, true);
});

test("silence times out without asking Whisper to hallucinate a transcript", async () => {
  const worker = new Worker();
  const capture = new Capture();
  const session = new LocalTranscriptionService(new WorkerTranscriptionProvider({ id: "test", manifest, models, createWorker: () => worker, workletUrl: "/worklet", capture }));
  const pending = session.transcribe({ language: "en-US", privacy: "local-only" });
  await turn();
  for (let sequence = 0; sequence < 300; sequence++) {
    capture.frame?.(new Float32Array(1600));
    worker.send({ type: "ack", sessionId: worker.sessionId, sequence });
  }
  assert.equal(capture.stopped, true);
  assert.deepEqual(worker.requests.at(-1), { type: "finish", sessionId: worker.sessionId, hasSpeech: false });
  worker.send({ type: "event", sessionId: worker.sessionId, event: { type: "final", text: "" } });
  assert.equal(await pending, null);
});
