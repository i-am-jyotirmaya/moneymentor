import { RecognitionSpeechAdapter } from "../../web/lib/speech-transcription";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import {
  getSpeechRecognition as getBrowserSpeechRecognition,
  saveExport as saveBrowserExport,
  type SpeechRecognitionLike,
} from "../../web/lib/platform";

export type { SpeechRecognitionLike } from "../../web/lib/platform";

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

class NativeSpeechRecognition implements SpeechRecognitionLike {
  continuous = false;
  interimResults = false;
  lang = "en-IN";
  onend: SpeechRecognitionLike["onend"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onresult: SpeechRecognitionLike["onresult"] = null;
  private cancelled = false;
  private ended = false;

  start() {
    this.cancelled = false;
    this.ended = false;
    void this.listen();
  }

  private finish() {
    if (!this.ended) { this.ended = true; this.onend?.(); }
  }

  private async listen() {
    try {
      if (!(await SpeechRecognition.available()).available) throw new Error("Speech unavailable");
      let permission = await SpeechRecognition.checkPermissions();
      if (permission.speechRecognition !== "granted") permission = await SpeechRecognition.requestPermissions();
      if (this.cancelled) return;
      if (permission.speechRecognition !== "granted") throw new Error("Microphone permission required");
      const result = await SpeechRecognition.start({ language: this.lang, maxResults: 1, partialResults: false, popup: true });
      const transcript = result.matches?.[0]?.trim();
      if (!this.cancelled && transcript) this.onresult?.({ results: [[{ transcript }]] });
    } catch {
      if (!this.cancelled) this.onerror?.();
    } finally {
      this.finish();
    }
  }

  stop() {
    this.cancelled = true;
    void SpeechRecognition.stop().catch(() => {}).finally(() => this.finish());
  }
}

export function getSpeechRecognition() {
  return Capacitor.isNativePlatform() ? NativeSpeechRecognition : getBrowserSpeechRecognition();
}

export function getSpeechTranscription() {
  const Recognition = getSpeechRecognition();
  return Recognition ? new RecognitionSpeechAdapter(Recognition,
    Capacitor.isNativePlatform() ? "capacitor-community-speech-recognition" : "browser-speech-recognition",
    getProcessingLocation()) : undefined;
}
export function getProcessingLocation(): "browser" | "device" {
  return Capacitor.isNativePlatform() ? "device" : "browser";
}
