export type ProcessingLocation = "local" | "system" | "cloud";
export type SpeechPrivacy = "local-only" | "allow-system" | "allow-backend";

export interface TranscriptionOptions {
  language: string;
  privacy: SpeechPrivacy;
}

export type TranscriptionEvent =
  | { type: "partial"; text: string }
  | { type: "final"; text: string; language?: string }
  | { type: "recording" }
  | { type: "speech-start" }
  | { type: "speech-end" };

export interface TranscriptionResult {
  rawText: string;
  text: string;
  language?: string;
  durationMs: number;
  processing: { local: boolean; location: ProcessingLocation; provider: string; model: string };
}

/** Each provider instance owns exactly one utterance and its microphone resources. */
export interface TranscriptionProvider {
  readonly id: string;
  readonly model: string;
  readonly location: ProcessingLocation;
  initialize(options: TranscriptionOptions): Promise<void>;
  start(): AsyncIterable<TranscriptionEvent>;
  finish?(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export type SpeechErrorCode = "unavailable" | "download-required" | "privacy" | "recognition";
export class SpeechError extends Error {
  readonly code: SpeechErrorCode;
  constructor(code: SpeechErrorCode, message: string) {
    super(message);
    this.name = "SpeechError";
    this.code = code;
  }
}

export function normalizeTranscript(text: string): string {
  // Preserve words, amounts and merchant names; financial interpretation belongs to the assistant.
  return text.replace(/\s+/g, " ").trim();
}
