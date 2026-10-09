import { SpeechError } from "./contracts.ts";
import type { TranscriptionEvent, TranscriptionOptions, TranscriptionProvider } from "./contracts.ts";
import { SpeechEventStream } from "./event-stream.ts";

export interface BrowserRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  onresult: ((event: { results: ArrayLike<{ isFinal?: boolean; 0?: { transcript: string } }> }) => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

export interface BrowserRecognitionConstructor {
  new (): BrowserRecognition;
  available?(options: { langs: string[]; processLocally: boolean }): Promise<string>;
  install?(options: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}

export function browserRecognitionConstructor(): BrowserRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window as typeof window & { SpeechRecognition?: BrowserRecognitionConstructor; webkitSpeechRecognition?: BrowserRecognitionConstructor };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition;
}

/** Capability check only: no permission request, recording, install or upload. */
export async function inspectBrowserSpeech(language: string, Recognition = browserRecognitionConstructor()) {
  if (!Recognition) return { system: false, local: "unavailable" as const };
  if (!("processLocally" in new Recognition()) || !Recognition.available) return { system: true, local: "unavailable" as const };
  const status = await Recognition.available({ langs: [language], processLocally: true });
  return { system: true, local: ["available", "downloadable", "downloading"].includes(status) ? status : "unavailable" };
}

export async function installBrowserLanguage(language: string, Recognition = browserRecognitionConstructor()) {
  if (!Recognition?.install) throw new SpeechError("unavailable", "This browser cannot download on-device speech languages.");
  if (!await Recognition.install({ langs: [language], processLocally: true })) {
    throw new SpeechError("unavailable", "The speech language could not be installed. Try again or keep typing.");
  }
}

export class BrowserTranscriptionProvider implements TranscriptionProvider {
  readonly id = "browser-speech";
  readonly model = "browser-managed";
  readonly location: "local" | "system";
  private Recognition?: BrowserRecognitionConstructor;
  private recognition?: BrowserRecognition;
  private stream = new SpeechEventStream();
  private disposed = false;
  private started = false;
  private stopped = false;

  constructor(local: boolean, Recognition = browserRecognitionConstructor()) {
    this.location = local ? "local" : "system";
    this.Recognition = Recognition;
  }

  async initialize(options: TranscriptionOptions) {
    const Recognition = this.Recognition;
    if (!Recognition) throw new SpeechError("unavailable", "Voice input is unavailable in this browser. You can still type.");
    if (options.privacy === "local-only" && this.location !== "local") throw new SpeechError("privacy", "Choose on-device speech to keep audio local.");
    const recognition = new Recognition();
    if (this.location === "local") {
      if (!("processLocally" in recognition) || !Recognition.available) {
        throw new SpeechError("unavailable", "On-device speech is unavailable in this browser. You can still type.");
      }
      const availability = await Recognition.available({ langs: [options.language], processLocally: true });
      if (this.disposed) return;
      if (availability === "downloadable" || availability === "downloading") throw new SpeechError("download-required", "Download the on-device speech language before using the microphone.");
      if (availability !== "available") throw new SpeechError("unavailable", "On-device speech is unavailable for this language. Try a different voice language in Settings.");
      recognition.processLocally = true;
    }
    if (this.disposed) return;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = options.language;
    recognition.onresult = event => {
      const results = Array.from(event.results);
      const text = results.map(result => result[0]?.transcript ?? "").join(" ");
      // Compatibility recognizers may omit isFinal; real Web Speech results always expose it.
      const final = results.length > 0 && results.every(result => result.isFinal !== false);
      this.stream.push({ type: final ? "final" : "partial", text });
    };
    recognition.onerror = event => {
      this.stream.end(new SpeechError("recognition", event?.error === "not-allowed"
        ? "Microphone access was denied. Check your device permissions or keep typing."
        : "Speech recognition failed. Try again or keep typing."));
    };
    recognition.onend = () => this.stream.end();
    this.recognition = recognition;
  }

  start(): AsyncIterable<TranscriptionEvent> {
    if (!this.recognition || this.disposed || this.started) throw new Error("Speech provider is not ready.");
    this.started = true;
    this.recognition.start();
    return this.stream;
  }

  async stop() { this.stopped = true; this.recognition?.stop(); }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const recognition = this.recognition;
    this.recognition = undefined;
    this.stream.end();
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      if (!this.stopped) (recognition.abort ?? recognition.stop).call(recognition);
    }
  }
}
