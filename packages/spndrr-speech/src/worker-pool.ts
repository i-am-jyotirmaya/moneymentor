import type { SpeechInferenceWorker } from "./worker-provider.ts";

/** Keep only a completed decoder warm. Cancelled/failed sessions always terminate their worker. */
export class SpeechWorkerPool {
  private idle?: SpeechInferenceWorker;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private idleMs: number;
  constructor(idleMs = 120000) { this.idleMs = idleMs; }

  async acquire(create: () => SpeechInferenceWorker | Promise<SpeechInferenceWorker>) {
    const generation = this.generation;
    const cached = this.idle;
    this.idle = undefined;
    clearTimeout(this.timer);
    const worker = cached ?? await create();
    if (generation !== this.generation) { worker.terminate(); throw new Error("Speech session cancelled."); }
    let released = false;
    return { worker, warm: !!cached, release: (completed: boolean) => {
      if (released) return;
      released = true;
      worker.onmessage = worker.onerror = null;
      if (!completed || generation !== this.generation) { worker.terminate(); return; }
      this.idle?.terminate();
      clearTimeout(this.timer);
      this.idle = worker;
      worker.onerror = () => { if (this.idle === worker) this.clear(); };
      this.timer = setTimeout(() => this.clear(), this.idleMs);
    } };
  }

  clear() {
    this.generation++;
    clearTimeout(this.timer);
    this.idle?.terminate();
    this.idle = undefined;
  }
}
