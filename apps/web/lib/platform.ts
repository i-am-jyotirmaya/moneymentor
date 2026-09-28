import { RecognitionSpeechAdapter, type SpeechTranscriptionAdapter } from "./speech-transcription";
import { browserTextRecognition, type TextRecognitionAdapter } from "./text-recognition";

export type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    isFinal?: boolean;
    0?: {
      transcript: string;
      confidence?: number;
    };
  }>;
};

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type PlatformServices = {
  getSpeechRecognition: () => SpeechRecognitionConstructor | undefined;
  getSpeechTranscription?: () => SpeechTranscriptionAdapter | undefined;
  getTextRecognition?: () => TextRecognitionAdapter;
  getProcessingLocation?: () => "browser" | "device";
  saveExport: (blob: Blob, fileName: string) => Promise<void>;
};
let platformServices: PlatformServices | undefined;

// Mobile installs its adapters at startup; the web build has no native dependencies.
export function configurePlatform(services: PlatformServices) {
  platformServices = services;
  return () => { if (platformServices === services) platformServices = undefined; };
}

export function getSpeechRecognition(): SpeechRecognitionConstructor | undefined {
  if (platformServices) return platformServices.getSpeechRecognition();
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function getProcessingLocation(): "browser" | "device" {
  return platformServices?.getProcessingLocation?.() ?? "browser";
}
export function getSpeechTranscription(): SpeechTranscriptionAdapter | undefined {
  if (platformServices?.getSpeechTranscription) return platformServices.getSpeechTranscription();
  const Recognition = getSpeechRecognition();
  return Recognition ? new RecognitionSpeechAdapter(Recognition, "browser-speech-recognition", "browser") : undefined;
}
export function getTextRecognition(): TextRecognitionAdapter {
  return platformServices?.getTextRecognition?.() ?? browserTextRecognition;
}

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
