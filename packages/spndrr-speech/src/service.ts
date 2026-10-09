import { normalizeTranscript, SpeechError } from "./contracts.ts";
import type { TranscriptionEvent, TranscriptionOptions, TranscriptionProvider, TranscriptionResult } from "./contracts.ts";

export class LocalTranscriptionService {
  private provider: TranscriptionProvider;
  private cancelled = false;
  private running = false;
  private cleanup?: Promise<void>;

  constructor(provider: TranscriptionProvider) { this.provider = provider; }

  private release() {
    return this.cleanup ??= this.provider.dispose();
  }

  async finish() { await this.provider.finish?.(); }

  async cancel() {
    this.cancelled = true;
    await this.release();
  }

  async transcribe(options: TranscriptionOptions, onEvent: (event: TranscriptionEvent) => void = () => {}): Promise<TranscriptionResult | null> {
    if (this.running) throw new Error("A speech session can only be used once.");
    this.running = true;
    const started = performance.now();
    try {
      if (this.cancelled) return null;
      if (options.privacy === "local-only" && this.provider.location !== "local") {
        throw new SpeechError("privacy", "This speech provider cannot guarantee on-device processing.");
      }
      if (this.provider.location === "system" && options.privacy !== "allow-system") {
        throw new SpeechError("privacy", "System speech requires its own provider consent.");
      }
      if (this.provider.location === "cloud" && options.privacy !== "allow-backend") {
        throw new SpeechError("privacy", "Backend transcription requires separate audio upload consent.");
      }
      await this.provider.initialize(options);
      if (this.cancelled) return null;
      for await (const event of this.provider.start()) {
        if (this.cancelled) return null;
        onEvent(event);
        if (event.type !== "final") continue;
        const text = normalizeTranscript(event.text);
        await this.provider.stop();
        if (this.cancelled || !text) return null;
        return {
          rawText: event.text, text, language: event.language ?? options.language,
          durationMs: Math.round(performance.now() - started),
          processing: { local: this.provider.location === "local", location: this.provider.location, provider: this.provider.id, model: this.provider.model },
        };
      }
      return null;
    } catch (error) {
      if (this.cancelled) return null;
      throw error;
    } finally {
      await this.release();
    }
  }
}
