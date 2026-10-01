import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { saveExport as saveBrowserExport } from "../../web/lib/platform";
import { BrowserTranscriptionProvider, SpeechError, SpeechEventStream } from "../../../packages/spndrr-speech/src/index";
import type { SpeechPrivacy, TranscriptionEvent, TranscriptionOptions, TranscriptionProvider } from "../../../packages/spndrr-speech/src/index";

export async function saveExport(blob: Blob, fileName: string) {
  if (!Capacitor.isNativePlatform()) return saveBrowserExport(blob, fileName);
  // Use private cache storage, not world-readable external storage.
  const path = `exports/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { uri } = await Filesystem.writeFile({
    path, directory: Directory.Cache, encoding: Encoding.UTF8,
    data: await blob.text(), recursive: true,
  });
  // Keep the cached file available while the receiving app reads its FileProvider URI.
  // A later export replaces it; the OS may evict this private cache at any time.
  await Share.share({ title: "Spndrr data export", files: [uri] });
}

// The installed system plugin does not expose an enforceable offline-only option.
// Always label it "system"; the shared service rejects it for local-only sessions.
let nativeOwner: NativeSystemTranscriptionProvider | undefined;
class NativeSystemTranscriptionProvider implements TranscriptionProvider {
  readonly id = "capacitor-system-speech";
  readonly model = "os-managed";
  readonly location = "system" as const;
  private stream = new SpeechEventStream();
  private language = "en-IN";
  private disposed = false;
  private pending = false;

  async initialize(options: TranscriptionOptions) {
    if (options.privacy === "local-only") throw new SpeechError("privacy", "On-device model transcription is not installed in this app yet. You can keep typing.");
    if (nativeOwner) throw new SpeechError("recognition", "The previous speech session is still closing. Try again shortly.");
    if (!(await SpeechRecognition.available()).available) throw new SpeechError("unavailable", "System speech is unavailable on this device.");
    if (this.disposed) return;
    let permission = await SpeechRecognition.checkPermissions();
    if (this.disposed) return;
    if (permission.speechRecognition !== "granted") permission = await SpeechRecognition.requestPermissions();
    if (this.disposed) return;
    if (permission.speechRecognition !== "granted") throw new SpeechError("recognition", "Microphone access was denied. Check device permissions or keep typing.");
    this.language = options.language;
  }

  start(): AsyncIterable<TranscriptionEvent> {
    if (this.disposed || nativeOwner) throw new SpeechError("recognition", "The speech session is no longer available.");
    nativeOwner = this;
    this.pending = true;
    void this.listen();
    return this.stream;
  }

  private async listen() {
    try {
      // Preserve the existing one-shot compatibility flow; native model streaming is a later adapter.
      const result = await SpeechRecognition.start({ language: this.language, maxResults: 1, partialResults: false, popup: false });
      if (!this.disposed && result.matches?.[0]) this.stream.push({ type: "final", text: result.matches[0], language: this.language });
    } catch {
      if (!this.disposed) this.stream.end(new SpeechError("recognition", "Speech recognition failed. Try again or keep typing."));
    } finally {
      this.pending = false;
      if (this.disposed && nativeOwner === this) {
        await SpeechRecognition.stop().catch(() => {});
        nativeOwner = undefined;
      }
      this.stream.end();
    }
  }

  async stop() {
    if (nativeOwner === this) await SpeechRecognition.stop();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stream.end();
    if (nativeOwner === this) {
      await SpeechRecognition.stop().catch(() => {});
      if (!this.pending) nativeOwner = undefined;
    }
  }
}

export function getTranscriptionProvider(privacy: SpeechPrivacy): TranscriptionProvider {
  return Capacitor.isNativePlatform() ? new NativeSystemTranscriptionProvider() : new BrowserTranscriptionProvider(privacy === "local-only");
}
