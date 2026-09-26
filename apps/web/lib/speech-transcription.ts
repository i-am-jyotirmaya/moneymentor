import type { AssistantInput } from "./assistant-input";
import type { SpeechRecognitionConstructor, SpeechRecognitionLike } from "./platform";

export interface SpeechOptions {
  locale: string;
  onResult: (input: AssistantInput) => void;
  onError: () => void;
  onEnd: () => void;
}
/** Moonshine/Sherpa-ONNX implement this seam without changing assistant logic. */
export interface SpeechTranscriptionAdapter {
  start(options: SpeechOptions): void;
  stop(): void;
}
export class RecognitionSpeechAdapter implements SpeechTranscriptionAdapter {
  private recognition?: SpeechRecognitionLike;
  private finish?: () => void;
  constructor(private readonly Recognition: SpeechRecognitionConstructor,
    private readonly engine: string, private readonly processingLocation: "browser" | "device") {}
  start(options: SpeechOptions) {
    this.stop();
    const recognition = new this.Recognition();
    this.recognition = recognition;
    let active = true;
    let delivered = false;
    const started = performance.now();
    const finish = () => { if (active) { active = false; options.onEnd(); } };
    this.finish = finish;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = options.locale;
    recognition.onresult = event => {
      if (!active || delivered) return;
      const results = Array.from(event.results).filter(result => result.isFinal !== false);
      const text = results.map(result => result[0]?.transcript ?? "").join(" ").trim();
      if (!text) return;
      delivered = true;
      const confidence = results[0]?.[0]?.confidence;
      options.onResult({ version: 1, source: "voice", text, locale: options.locale,
        ...(confidence !== undefined && confidence >= 0 && confidence <= 1 ? { acquisitionConfidence: confidence } : {}),
        metadata: { engine: this.engine, processingLocation: this.processingLocation, durationMs: performance.now() - started } });
    };
    recognition.onend = finish;
    recognition.onerror = () => { if (active) { options.onError(); finish(); } };
    try { recognition.start(); } catch { recognition.onerror(); }
  }
  stop() {
    this.finish?.(); // Invalidate before stop: late results cannot submit.
    this.finish = undefined;
    try { this.recognition?.stop(); } catch { /* Already stopped. */ }
    this.recognition = undefined;
  }
}
