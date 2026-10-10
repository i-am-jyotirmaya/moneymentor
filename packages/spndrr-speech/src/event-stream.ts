import type { TranscriptionEvent } from "./contracts.ts";

/** Event bridge for browser/native callbacks. Coalesces interim results to bound memory. */
export class SpeechEventStream implements AsyncIterable<TranscriptionEvent> {
  private events: TranscriptionEvent[] = [];
  private wake?: () => void;
  private ended = false;
  private error?: Error;

  push(event: TranscriptionEvent) {
    if (this.ended) return;
    if (event.type === "partial" && this.events.at(-1)?.type === "partial") this.events.pop();
    this.events.push(event);
    this.wake?.();
  }

  end(error?: Error) {
    if (this.ended) return;
    this.ended = true;
    this.error = error;
    this.wake?.();
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      const event = this.events.shift();
      if (event) { yield event; continue; }
      if (this.ended) {
        if (this.error) throw this.error;
        return;
      }
      await new Promise<void>(resolve => { this.wake = resolve; });
      this.wake = undefined;
    }
  }
}
