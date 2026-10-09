import { BrowserTranscriptionProvider, type SpeechPrivacy, type TranscriptionProvider } from "../../../packages/spndrr-speech/src/index";

import { downloadedTranscriptionProvider } from "./speech/downloaded-model";

type PlatformServices = {
  isNativeSpeech?: () => boolean;
  getTranscriptionProvider: (privacy: SpeechPrivacy) => TranscriptionProvider;
  saveExport: (blob: Blob, fileName: string) => Promise<void>;
};
let platformServices: PlatformServices | undefined;

// Mobile installs its adapters at startup; the web build has no native dependencies.
export function configurePlatform(services: PlatformServices) {
  platformServices = services;
  return () => { if (platformServices === services) platformServices = undefined; };
}

export function getTranscriptionProvider(privacy: SpeechPrivacy, engine: "browser" | "whisper" = "browser"): TranscriptionProvider {
  if (isNativeSpeechPlatform()) return platformServices!.getTranscriptionProvider(privacy);
  if (engine === "whisper") return downloadedTranscriptionProvider();
  if (platformServices) return platformServices.getTranscriptionProvider(privacy);
  return new BrowserTranscriptionProvider(privacy === "local-only");
}

export function isNativeSpeechPlatform() { return platformServices?.isNativeSpeech?.() === true; }

export async function saveExport(blob: Blob, fileName: string) {
  if (platformServices) return platformServices.saveExport(blob, fileName);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
