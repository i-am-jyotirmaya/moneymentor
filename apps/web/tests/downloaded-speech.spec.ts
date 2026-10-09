import { expect, test } from "@playwright/test";
import { installFixtureModel, captureFixtureAudio } from "./helpers/local-speech";

// Opt-in real inference: immutable model files + the public JFK audio fixture, no mock decoder.
// See docs/LOCAL_SPEECH_RUNTIME.md for the fixture preparation and command.
const fixtureDirectory = process.env.SPNDRR_SPEECH_FIXTURE_DIR;
test("installed Whisper transcribes full and quiet paused sentences offline with a warm decoder", async ({ page }, testInfo) => {
  test.skip(!fixtureDirectory, "Set SPNDRR_SPEECH_FIXTURE_DIR to run the real model acceptance test.");
  test.skip(testInfo.project.name !== "desktop-chromium", "Run this CPU-heavy acceptance test once.");
  test.setTimeout(180000);
  await installFixtureModel(page, fixtureDirectory!, "/login");
  await captureFixtureAudio(page, fixtureDirectory!, "jfk.pcm");
  await page.evaluate(() => {
    const Original = window.Worker;
    Object.assign(window, { __workersCreated: 0 });
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { __workersCreated: number }).__workersCreated++;
      }
    };
  });
  const requests: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("blob:")) requests.push(request.url()); });
  await page.context().setOffline(true);
  const transcribe = () => page.evaluate(async () => {
    const api = (window as unknown as { __localSpeechApi: { LocalTranscriptionService: typeof import("../../../packages/spndrr-speech/src/service").LocalTranscriptionService; downloadedTranscriptionProvider: typeof import("../lib/speech/downloaded-model").downloadedTranscriptionProvider } }).__localSpeechApi;
    const events: string[] = [];
    const service = new api.LocalTranscriptionService(api.downloadedTranscriptionProvider());
    const started = performance.now();
    let loadingMs = 0;
    const result = await service.transcribe({ language: "en-US", privacy: "local-only" }, (event: { type: string }) => {
      events.push(event.type);
      if (event.type === "recording") loadingMs = performance.now() - started;
    });
    const globals = window as unknown as { __microphonesStopped: number; __workersCreated: number };
    return { result, events, stopped: globals.__microphonesStopped, workers: globals.__workersCreated, loadingMs };
  });
  const result = await transcribe();
  expect(result.result?.text.toLowerCase()).toContain("my fellow americans");
  // Tiny can spell the sound "your" as "you are"; both complete clauses are still required.
  expect(result.result?.text.toLowerCase()).toMatch(/ask not what (?:your|you are) country can do for you/);
  expect(result.result?.text.toLowerCase()).toContain("what you can do for your country");
  expect(result.result?.processing.local).toBe(true);
  expect(result.events).toContain("recording");
  expect(result.events).toContain("speech-end");
  expect(result.events.filter(type => type === "final")).toHaveLength(1);
  expect(result.stopped).toBe(1);
  await captureFixtureAudio(page, fixtureDirectory!, "paused-expense.pcm");
  const second = await transcribe();
  expect(second.result?.text.toLowerCase()).toMatch(/spent.*(450|four hundred and fifty).*rupees.*dinner/);
  expect(second.stopped).toBe(1);
  expect(second.workers).toBe(1);
  expect(second.events.filter(type => type === "final")).toHaveLength(1);
  console.log("Local Whisper cold/warm load (ms):", Math.round(result.loadingMs), Math.round(second.loadingMs), "transcripts:", result.result?.text, second.result?.text);
  expect(requests.filter(url => /huggingface|speech\/|cdn/.test(url))).toEqual([]);
});
