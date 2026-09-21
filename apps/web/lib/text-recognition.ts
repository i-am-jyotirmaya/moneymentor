import type { Worker } from "tesseract.js";
import type { AssistantInput } from "./assistant-input";
import { sanitizeImageText } from "./image-text-privacy";

export interface TextRecognitionOptions {
  locale?: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}
export interface TextRecognitionAdapter {
  recognize(image: Blob, options?: TextRecognitionOptions): Promise<AssistantInput>;
  dispose(): Promise<void>;
}
export class TesseractTextRecognitionAdapter implements TextRecognitionAdapter {
  private worker?: Promise<Worker>;
  private progress?: (progress: number) => void;
  private busy = false;
  private generation = 0;

  async recognize(image: Blob, options: TextRecognitionOptions = {}): Promise<AssistantInput> {
    if (!/^image\/(png|jpeg|webp)$/.test(image.type) || image.size > 10 * 1024 * 1024 || !image.size)
      throw new Error("Choose a PNG, JPEG or WebP image smaller than 10 MB.");
    if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (this.busy) throw new Error("Please wait for the current image.");
    this.busy = true;
    this.progress = options.onProgress;
    const started = performance.now();
    const generation = this.generation;
    let abort = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => { void this.dispose(); reject(new DOMException("Cancelled", "AbortError")); };
        options.signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(() => { void this.dispose(); reject(new Error("Reading timed out. Try a smaller screenshot.")); }, 90_000);
      });
      const work = async () => {
        if (!this.worker) this.worker = import("tesseract.js").then(async ({ createWorker, PSM }) => {
          const worker = await createWorker("eng", 1, {
            workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang",
            workerBlobURL: false, logger: event => this.progress?.(event.progress), errorHandler: () => {},
          });
          if (generation !== this.generation) { await worker.terminate(); throw new DOMException("Cancelled", "AbortError"); }
          await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
          return worker;
        });
        const worker = await this.worker;
        const { data } = await worker.recognize(image);
        const text = sanitizeImageText(data.text);
        if (text.length < 3) throw new Error("I couldn't read enough information from that image. Try another screenshot or type the expense.");
        if (text.length > 4000) throw new Error("That image contains too much text. Crop it to one payment and try again.");
        return { version: 1, source: "image", text, locale: options.locale ?? "en-IN",
          acquisitionConfidence: Math.max(0, Math.min(1, data.confidence / 100)),
          metadata: { engine: "tesseract", processingLocation: "browser", durationMs: performance.now() - started } } satisfies AssistantInput;
      };
      return await Promise.race([work(), cancelled]);
    } catch (error) {
      void this.dispose();
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (generation === this.generation) { this.busy = false; this.progress = undefined; }
    }
  }
  async dispose() {
    this.generation++;
    const worker = this.worker;
    this.worker = undefined;
    this.busy = false;
    this.progress = undefined;
    // Never wait for a stuck model initialization before allowing cancellation.
    void worker?.then(value => value.terminate()).catch(() => {});
  }
}
export const browserTextRecognition = new TesseractTextRecognitionAdapter();
