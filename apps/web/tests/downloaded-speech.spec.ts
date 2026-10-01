import { expect, test } from "@playwright/test";
import { installFixtureModel, captureFixtureAudio } from "./helpers/local-speech";

// Opt-in real inference: immutable model files + the public JFK audio fixture, no mock decoder.
// See docs/LOCAL_SPEECH_RUNTIME.md for the fixture preparation and command.
const fixtureDirectory = process.env.SPNDRR_SPEECH_FIXTURE_DIR;
test("installed Whisper transcribes real audio offline and releases microphone resources", async ({ page }, testInfo) => {
  test.skip(!fixtureDirectory, "Set SPNDRR_SPEECH_FIXTURE_DIR to run the real model acceptance test.");
  test.skip(testInfo.project.name !== "desktop-chromium", "Run this CPU-heavy acceptance test once.");
  test.setTimeout(180000);
  await installFixtureModel(page, fixtureDirectory!, "/login");
  await captureFixtureAudio(page, fixtureDirectory!, "jfk.pcm");
  const requests: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("blob:")) requests.push(request.url()); });
  await page.context().setOffline(true);
  const result = await page.evaluate(async () => {
    const api = (window as unknown as { __localSpeechApi: { LocalTranscriptionService: typeof import("../../../packages/spndrr-speech/src/service").LocalTranscriptionService; downloadedTranscriptionProvider: typeof import("../lib/speech/downloaded-model").downloadedTranscriptionProvider } }).__localSpeechApi;
    const events: string[] = [];
    const service = new api.LocalTranscriptionService(api.downloadedTranscriptionProvider());
    const result = await service.transcribe({ language: "en-US", privacy: "local-only" }, (event: { type: string }) => events.push(event.type));
    return { result, events, stopped: (window as unknown as { __microphonesStopped: number }).__microphonesStopped };
  });
  expect(result.result?.text.toLowerCase()).toContain("my fellow americans");
  expect(result.result?.processing.local).toBe(true);
  expect(result.events).toContain("recording");
  expect(result.events).toContain("speech-end");
  expect(result.events.filter(type => type === "final")).toHaveLength(1);
  expect(result.stopped).toBe(1);
  expect(requests.filter(url => /huggingface|speech\/|cdn/.test(url))).toEqual([]);
});
