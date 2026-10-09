import assert from "node:assert/strict";
import { test } from "node:test";
import { BackendTranscriptionProvider } from "../src/backend-provider.ts";
import { LocalTranscriptionService } from "../src/service.ts";
import { encodeSpeechWav } from "../src/wav.ts";
import type { PcmAudioSource } from "../src/worker-provider.ts";

class Capture implements PcmAudioSource {
  onFrame?: (pcm: Float32Array) => void;
  starts = 0; disposals = 0;
  async start(_url: string, callback: (pcm: Float32Array) => void) { this.starts++; this.onFrame = callback; }
  async dispose() { this.disposals++; }
  speak(value = 0.01, samples = 16000) { this.onFrame?.(new Float32Array(samples).fill(value)); }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("WAV preserves sample duration, channel format, polarity and clips safely", () => {
  const wav = encodeSpeechWav([Float32Array.from([-1, 0, 0.5, 1, 2])]);
  const data = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  assert.equal(data.getUint32(24, true), 16000);
  assert.equal(data.getUint16(22, true), 1);
  assert.equal(data.getUint32(40, true), 10);
  assert.deepEqual([44, 46, 48, 50, 52].map(offset => data.getInt16(offset, true)), [-32768, 0, 16384, 32767, 32767]);
  assert.throws(() => encodeSpeechWav([]));
  assert.throws(() => encodeSpeechWav([new Float32Array(480001)]));
  assert.throws(() => encodeSpeechWav([Float32Array.from([NaN])]));
});

test("system consent cannot start a backend microphone or upload", async () => {
  const capture = new Capture(); let uploads = 0;
  const service = new LocalTranscriptionService(new BackendTranscriptionProvider({ capture, model: "test", workletUrl: "test", upload: async () => { uploads++; return { text: "wrong" }; } }));
  await assert.rejects(service.transcribe({ language: "en-IN", privacy: "allow-system" }), /separate audio upload consent/);
  assert.equal(capture.starts, 0); assert.equal(uploads, 0);
});

test("only Finish uploads one WAV after stopping capture and preserves rupee words", async () => {
  const capture = new Capture(); let uploads = 0; let retained: Uint8Array | undefined;
  const service = new LocalTranscriptionService(new BackendTranscriptionProvider({ capture, model: "test", workletUrl: "test", upload: async (wav, language) => {
    uploads++; retained = wav;
    assert.equal(capture.disposals, 1); assert.equal(language, "en-IN");
    assert.equal(new DataView(wav.buffer).getUint32(40, true), 32000);
    return { text: "bought coffee for 30 rupees" };
  } }));
  const result = service.transcribe({ language: "en-IN", privacy: "allow-backend" });
  await tick(); capture.speak(); assert.equal(uploads, 0);
  await Promise.all([service.finish(), service.finish()]);
  assert.equal((await result)?.text, "bought coffee for 30 rupees");
  assert.equal(uploads, 1); assert.equal(retained?.every(byte => byte === 0), true);
});

test("Cancel before Finish discards recording without any upload", async () => {
  const capture = new Capture(); let uploads = 0;
  const service = new LocalTranscriptionService(new BackendTranscriptionProvider({ capture, model: "test", workletUrl: "test", upload: async () => { uploads++; return { text: "late" }; } }));
  const result = service.transcribe({ language: "hi-IN", privacy: "allow-backend" });
  await tick(); capture.speak(); await service.cancel(); await service.finish();
  assert.equal(await result, null); assert.equal(uploads, 0); assert.ok(capture.disposals > 0);
});

test("Cancel in flight aborts upload and suppresses a late final", async () => {
  const capture = new Capture(); let resolve!: (result: { text: string }) => void; let signal!: AbortSignal;
  const service = new LocalTranscriptionService(new BackendTranscriptionProvider({ capture, model: "test", workletUrl: "test", upload: async (_wav, _language, abort) => { signal = abort; return await new Promise(done => { resolve = done; }); } }));
  const result = service.transcribe({ language: "en-IN", privacy: "allow-backend" });
  await tick(); capture.speak(); const finishing = service.finish(); await tick();
  await service.cancel(); assert.equal(signal.aborted, true); resolve({ text: "must not submit" });
  await finishing; assert.equal(await result, null);
});

test("digital silence and upload failures release capture without invented finals", async () => {
  for (const silent of [true, false]) {
    const capture = new Capture(); let uploads = 0;
    const service = new LocalTranscriptionService(new BackendTranscriptionProvider({ capture, model: "test", workletUrl: "test", upload: async () => { uploads++; throw new Error("upstream unavailable"); } }));
    const result = service.transcribe({ language: "en-IN", privacy: "allow-backend" });
    const rejected = assert.rejects(result, silent ? /No clear speech/ : /upstream unavailable/);
    await tick(); capture.speak(silent ? 0 : 0.01); await service.finish(); await rejected;
    assert.equal(uploads, silent ? 0 : 1); assert.ok(capture.disposals > 0);
  }
});

test("Finish flushes the last partial microphone frame before encoding", async () => {
  class TailCapture extends Capture {
    async finish() { this.speak(0.02, 123); }
  }
  const capture = new TailCapture();
  let payloadSamples = 0;
  const service = new LocalTranscriptionService(new BackendTranscriptionProvider({ capture, model: "test", workletUrl: "test", upload: async wav => {
    payloadSamples = new DataView(wav.buffer).getUint32(40, true) / 2;
    return { text: "coffee 30" };
  } }));
  const result = service.transcribe({ language: "en-IN", privacy: "allow-backend" });
  await tick(); capture.speak(); await service.finish(); await result;
  assert.equal(payloadSamples, 16123);
});

test("backend consent does not authorize a browser or native system speech provider", async () => {
  let initialized = false;
  const service = new LocalTranscriptionService({
    id: "native", model: "os", location: "system",
    initialize: async () => { initialized = true; },
    async *start() {}, stop: async () => {}, dispose: async () => {},
  });
  await assert.rejects(service.transcribe({ language: "en-IN", privacy: "allow-backend" }), /own provider consent/);
  assert.equal(initialized, false);
});
