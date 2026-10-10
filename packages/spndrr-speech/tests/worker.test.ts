import test from "node:test";
import assert from "node:assert/strict";
import { LocalTranscriptionService, WorkerTranscriptionProvider } from "../src/index.ts";
import type { SpeechInferenceWorker, PcmAudioSource, SpeechModelManager, SpeechModelManifest, SpeechWorkerRequest, SpeechWorkerResponse } from "../src/index.ts";

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
  assert.deepEqual(events, ["partial", "final"]);
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
  for (let sequence = 0; sequence < 11; sequence++) {
    capture.frame?.(new Float32Array(1600).fill(sequence < 2 ? 0.2 : 0));
    worker.send({ type: "ack", sessionId: worker.sessionId, sequence });
  }
  assert.equal(capture.stopped, true);
  assert.equal(worker.requests.at(-1)?.type, "finish");
  worker.send({ type: "event", sessionId: worker.sessionId, event: { type: "final", text: "spent 450 on dinner" } });
  assert.equal((await result)?.text, "spent 450 on dinner");
});
