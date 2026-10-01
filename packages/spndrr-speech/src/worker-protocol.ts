import type { TranscriptionEvent, TranscriptionOptions } from "./contracts.ts";
import type { SpeechModelManifest } from "./models.ts";

/** Model-specific workers implement this boundary. PCM buffers should be transferred, not cloned. */
export type SpeechWorkerRequest =
  | { type: "load"; sessionId: string; manifest: SpeechModelManifest; options: TranscriptionOptions; files: { path: string; bytes: Uint8Array }[] }
  | { type: "audio"; sessionId: string; sequence: number; sampleRate: 16000; pcm: Float32Array }
  | { type: "finish"; sessionId: string; hasSpeech?: boolean }
  | { type: "dispose"; sessionId: string };
export type SpeechWorkerResponse =
  | { type: "ready"; sessionId: string }
  | { type: "ack"; sessionId: string; sequence: number }
  | { type: "event"; sessionId: string; event: TranscriptionEvent }
  | { type: "error"; sessionId: string; message: string };
