export type SpeechRecognitionEventLike = {
  results: ArrayLike<{
    0?: {
      transcript: string;
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
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
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
