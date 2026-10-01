import test from "node:test";
import assert from "node:assert/strict";
import { BrowserPcmCapture, BrowserTranscriptionProvider, LocalTranscriptionService, PcmResampler, SpeechEndpointDetector, SpeechEventStream, normalizeTranscript } from "../src/index.ts";
import type { BrowserRecognition, TranscriptionOptions, TranscriptionProvider } from "../src/index.ts";

const options: TranscriptionOptions = { language: "en-IN", privacy: "local-only" };
class FakeRecognition implements BrowserRecognition {
  static instances: FakeRecognition[] = [];
  static availability = "available";
  static async available() { return this.availability; }
  processLocally = false;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: BrowserRecognition["onresult"] = null;
  onerror: BrowserRecognition["onerror"] = null;
  onend: BrowserRecognition["onend"] = null;
  starts = 0;
  stops = 0;
  aborts = 0;
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.starts++; }
  stop() { this.stops++; this.onend?.(); }
  abort() { this.aborts++; this.onend?.(); }
  result(text: string, isFinal: boolean) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] }); }
}
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

test("local browser recognition waits for final speech, preserves raw text and stops exactly once", async () => {
  FakeRecognition.availability = "available";
  const session = new LocalTranscriptionService(new BrowserTranscriptionProvider(true, FakeRecognition));
  const events: string[] = [];
  const result = session.transcribe(options, event => events.push(event.type));
  await turn();
  const recognition = FakeRecognition.instances.at(-1)!;
  assert.equal(recognition.processLocally, true);
  recognition.result("spent four fifty", false);
  await turn();
  assert.equal(recognition.stops, 0);
  recognition.result("  spent  four fifty at Meghana  ", true);
  recognition.result("duplicate callback", true);
  const transcript = await result;
  assert.equal(transcript?.rawText, "  spent  four fifty at Meghana  ");
  assert.equal(transcript?.text, "spent four fifty at Meghana");
  assert.equal(transcript?.processing.local, true);
  assert.deepEqual(events, ["partial", "final"]);
  assert.equal(recognition.stops, 1);
  assert.equal(recognition.aborts, 0);
  assert.equal(recognition.onresult, null);
});

test("local-only rejects system providers before any microphone or permission request", async () => {
  let initialized = false;
  const provider = {
    id: "system", model: "system", location: "system",
    async initialize() { initialized = true; },
    start() { return new SpeechEventStream(); }, async stop() {}, async dispose() {},
  } satisfies TranscriptionProvider;
  await assert.rejects(new LocalTranscriptionService(provider).transcribe(options), { code: "privacy" });
  assert.equal(initialized, false);
});

test("cancelling during language availability cannot start the microphone later", async () => {
  let resolveAvailability: (value: string) => void = () => {};
  class DeferredRecognition extends FakeRecognition {
    static available() { return new Promise<string>(resolve => { resolveAvailability = resolve; }); }
  }
  const session = new LocalTranscriptionService(new BrowserTranscriptionProvider(true, DeferredRecognition));
  const promise = session.transcribe(options);
  await session.cancel();
  resolveAvailability("available");
  assert.equal(await promise, null);
  assert.equal(FakeRecognition.instances.at(-1)!.starts, 0);
});

test("cancellation drops pending callbacks and releases the microphone", async () => {
  const session = new LocalTranscriptionService(new BrowserTranscriptionProvider(true, FakeRecognition));
  const result = session.transcribe(options);
  await turn();
  const recognition = FakeRecognition.instances.at(-1)!;
  const staleCallback = recognition.onresult;
  await session.cancel();
  staleCallback?.({ results: [{ 0: { transcript: "stale expense" }, isFinal: true }] });
  assert.equal(await result, null);
  assert.equal(recognition.aborts, 1);
});

test("download-required and unsupported local browsers never start system recognition", async () => {
  for (const availability of ["downloadable", "unavailable"]) {
    FakeRecognition.availability = availability;
    await assert.rejects(new LocalTranscriptionService(new BrowserTranscriptionProvider(true, FakeRecognition)).transcribe(options));
    assert.equal(FakeRecognition.instances.at(-1)!.starts, 0);
  }
  FakeRecognition.availability = "available";
  class LegacyRecognition extends FakeRecognition { constructor() { super(); delete this.processLocally; } }
  await assert.rejects(new LocalTranscriptionService(new BrowserTranscriptionProvider(true, LegacyRecognition)).transcribe(options), { code: "unavailable" });
});

test("recognition errors and empty utterances dispose the session", async () => {
  const session = new LocalTranscriptionService(new BrowserTranscriptionProvider(true, FakeRecognition));
  const result = session.transcribe(options);
  await turn();
  const rejected = assert.rejects(result, { code: "recognition" });
  FakeRecognition.instances.at(-1)!.onerror?.({ error: "not-allowed" });
  FakeRecognition.instances.at(-1)!.onend?.();
  await rejected;
  assert.equal(FakeRecognition.instances.at(-1)!.aborts, 1);
  const empty = new LocalTranscriptionService(new BrowserTranscriptionProvider(true, FakeRecognition)).transcribe(options);
  await turn();
  FakeRecognition.instances.at(-1)!.onend?.();
  assert.equal(await empty, null);
});

test("event bridge bounds interim updates without losing a final result", async () => {
  const stream = new SpeechEventStream();
  for (let i = 0; i < 10000; i++) stream.push({ type: "partial", text: String(i) });
  stream.push({ type: "final", text: "complete" });
  stream.end();
  const events = [];
  for await (const event of stream) events.push(event);
  assert.deepEqual(events, [{ type: "partial", text: "9999" }, { type: "final", text: "complete" }]);
});

test("resampling is invariant across chunk boundaries at 44.1 and 48 kHz", () => {
  for (const rate of [44100, 48000]) {
    const audio = Float32Array.from({ length: rate }, (_, i) => Math.sin(i / 12));
    const whole = new PcmResampler(rate).process([audio]);
    const resampler = new PcmResampler(rate);
    const parts: number[] = [];
    for (let offset = 0; offset < audio.length; offset += 127) parts.push(...resampler.process([audio.slice(offset, offset + 127)]));
    assert.equal(whole.length, 16000);
    assert.deepEqual(Float32Array.from(parts), whole);
  }
  assert.deepEqual(new PcmResampler(16000).process([new Float32Array([1, 1]), new Float32Array([-1, -1])]), new Float32Array([0, 0]));
  assert.throws(() => new PcmResampler(8000));
});

test("endpoint detection ignores brief noise, ends after silence, and bounds silent sessions", () => {
  const detector = new SpeechEndpointDetector();
  const frame = (value: number, ms = 100) => new Float32Array(ms * 16).fill(value);
  assert.equal(detector.process(frame(0.2)), undefined);
  assert.equal(detector.process(frame(0)), undefined);
  assert.equal(detector.process(frame(0.2)), undefined);
  assert.equal(detector.process(frame(0.2)), "speech-start");
  for (let i = 0; i < 8; i++) assert.equal(detector.process(frame(0)), undefined);
  assert.equal(detector.process(frame(0)), "speech-end");
  const silent = new SpeechEndpointDetector({ maxDurationMs: 100 });
  assert.equal(silent.process(frame(0)), "speech-end");
});

test("normalization never guesses money values", () => {
  assert.equal(normalizeTranscript(" spent  four fifty at meghana "), "spent four fifty at meghana");
});


test("audio priming before model load requests no microphone and cancellation closes the context", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  let contexts = 0, resumes = 0, closes = 0;
  class Context {
    state = "suspended";
    constructor() { contexts++; }
    async resume() { resumes++; this.state = "running"; }
    async close() { closes++; this.state = "closed"; }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: Context });
  try {
    const capture = new BrowserPcmCapture();
    capture.prepareAudio();
    await capture.dispose();
    await capture.dispose();
    assert.equal(contexts, 1);
    assert.equal(resumes, 1);
    assert.equal(closes, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "AudioContext", original);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
