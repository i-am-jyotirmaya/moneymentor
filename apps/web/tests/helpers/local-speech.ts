import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSync } from "esbuild";
import { whisperTiny } from "../../../../packages/spndrr-speech/src/catalog";

export async function installFixtureModel(page: Page, directory: string, target: string) {
  const script = buildSync({
    stdin: { contents: 'export * from "./lib/speech/downloaded-model"; export {LocalTranscriptionService} from "../../packages/spndrr-speech/src/service";', resolveDir: resolve(__dirname, "../..") },
    bundle: true, platform: "browser", format: "esm", write: false, target: "es2022",
  }).outputFiles[0].contents;
  await page.route("**/__speech-test.js", route => route.fulfill({ body: Buffer.from(script), contentType: "text/javascript" }));
  for (const file of whisperTiny.files) await page.route(file.url, route => route.fulfill({ body: readFileSync(resolve(directory, file.path)), contentType: "application/octet-stream" }));
  await page.goto(target);
  const result = await page.evaluate(async () => {
    const api = await import(String("/__speech-test.js"));
    return { installed: await api.installDownloadedModel(), state: api.modelDownloadSnapshot() };
  });
  expect(result.state.error).toBe("");
  expect(result.installed).toBe(true);
  await page.reload();
}

export async function captureFixtureAudio(page: Page, directory: string, file: string) {
  await page.route("**/__speech-fixture.pcm", route => route.fulfill({ body: readFileSync(resolve(directory, file)), contentType: "application/octet-stream" }));
  await page.evaluate(async () => {
    const api = await import(String("/__speech-test.js"));
    const pcm = new Float32Array(await (await fetch("/__speech-fixture.pcm")).arrayBuffer());
    Object.assign(window, { __localSpeechApi: api, __microphonesStopped: 0 });
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 16000 });
      const destination = context.createMediaStreamDestination();
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, pcm.length, 16000);
      source.buffer.copyToChannel(pcm, 0);
      source.connect(destination);
      await context.resume();
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); void context.close(); (window as unknown as { __microphonesStopped: number }).__microphonesStopped++; };
      }
      window.setTimeout(() => source.start(), 600);
      return destination.stream;
    };
  });
}
