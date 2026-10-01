import { BrowserPcmCapture, SpeechEndpointDetector } from "./audio.ts";
import { SpeechError } from "./contracts.ts";
import type { TranscriptionEvent, TranscriptionOptions, TranscriptionProvider } from "./contracts.ts";
import { SpeechEventStream } from "./event-stream.ts";
import type { SpeechModelManager, SpeechModelManifest } from "./models.ts";
import type { SpeechWorkerRequest, SpeechWorkerResponse } from "./worker-protocol.ts";

export interface PcmAudioSource {
  start(workletUrl: string, onFrame: (pcm: Float32Array) => void): Promise<void>;
  dispose(): Promise<void>;
}

export interface SpeechInferenceWorker {
  onmessage: ((event: MessageEvent<SpeechWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SpeechWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
}

/** Transport/lifecycle adapter, not an inference implementation. A model worker supplies decoding. */
export class WorkerTranscriptionProvider implements TranscriptionProvider {
  readonly id: string;
  readonly model: string;
  readonly location = "local" as const;
  private options: { id: string; manifest: SpeechModelManifest; models: SpeechModelManager; createWorker: () => SpeechInferenceWorker | Promise<SpeechInferenceWorker>; workletUrl: string; capture?: PcmAudioSource };
  private stream = new SpeechEventStream();
  private capture: PcmAudioSource;
  private worker?: SpeechInferenceWorker;
  private sessionId = crypto.randomUUID();
  private disposed = false;
  private started = false;
  private ready = false;
  private rejectReady?: (error: Error) => void;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private endpoint = new SpeechEndpointDetector();
  private sequence = 0;
  private waiting?: number;
  private ackTimer?: ReturnType<typeof setTimeout>;
  private queued: Float32Array[] = [];
  private queuedSamples = 0;
  private finishing = false;
  private heardSpeech = false;
  private failed = false;
  private finishTimer?: ReturnType<typeof setTimeout>;

  constructor(options: WorkerTranscriptionProvider["options"]) {
    this.options = options;
    this.id = options.id;
    this.model = `${options.manifest.id}@${options.manifest.version}`;
    this.capture = options.capture ?? new BrowserPcmCapture();
  }

  async initialize(options: TranscriptionOptions) {
    const { manifest, models } = this.options;
    if (!manifest.languages.includes(options.language) && !manifest.languages.includes(options.language.split("-")[0])) throw new SpeechError("unavailable", "This model does not support the selected speech language.");
    if (!await models.isModelInstalled(manifest)) throw new SpeechError("download-required", "Download this speech model before recording.");
    let files;
    try { files = await models.loadModel(manifest); }
    catch { throw new SpeechError("download-required", "This speech model is missing or damaged. Reinstall it before recording."); }
    if (this.disposed) return;
    const worker = await this.options.createWorker();
    if (this.disposed) { worker.terminate(); return; }
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      this.readyTimer = setTimeout(() => reject(new SpeechError("recognition", "The local speech model took too long to load.")), 90000);
      worker.onmessage = ({ data }) => {
        if (this.disposed || data.sessionId !== this.sessionId) return;
        if (data.type === "ready") {
          this.ready = true;
          clearTimeout(this.readyTimer);
          this.rejectReady = undefined;
          resolve();
        } else if (data.type === "error") this.fail(new SpeechError("recognition", data.message));
        else if (data.type === "event") {
          if (this.started) this.stream.push(data.event);
        } else if (data.type === "ack" && data.sequence === this.waiting) {
          clearTimeout(this.ackTimer);
          this.waiting = undefined;
          this.pump();
        }
      };
      worker.onerror = () => this.fail(new SpeechError("recognition", "The local speech worker failed."));
      const request: SpeechWorkerRequest = { type: "load", sessionId: this.sessionId, manifest, options, files };
      worker.postMessage(request, files.map(file => file.bytes.buffer as ArrayBuffer));
    });
  }

  start(): AsyncIterable<TranscriptionEvent> {
    if (this.disposed || !this.ready || this.started) throw new Error("Local speech worker is not ready.");
    this.started = true;
    void this.capture.start(this.options.workletUrl, pcm => {
      if (this.disposed || this.failed || this.finishing || !pcm.length) return;
      // At most two seconds queued plus one in-flight chunk. Stop instead of losing utterance audio.
      if (this.queuedSamples + pcm.length > 32000) { this.fail(new SpeechError("recognition", "This device cannot process speech fast enough. Try a smaller model.")); return; }
      this.queued.push(pcm);
      this.queuedSamples += pcm.length;
      const endpoint = this.endpoint.process(pcm);
      if (endpoint === "speech-start") this.heardSpeech = true;
      if (endpoint) this.stream.push({ type: endpoint });
      if (endpoint === "speech-end") {
        this.finishing = true;
        void this.capture.dispose().catch(() => {});
      }
      this.pump();
    }).then(() => { if (!this.disposed && !this.finishing) this.stream.push({ type: "recording" }); }).catch(error => { if (!this.disposed) this.fail(error instanceof Error ? error : new Error("Local microphone capture failed.")); });
    return this.stream;
  }

  private pump() {
    if (this.disposed || this.failed || !this.worker || this.waiting !== undefined) return;
    try {
      const pcm = this.queued.shift();
      if (pcm) {
        this.queuedSamples -= pcm.length;
        this.waiting = this.sequence++;
        this.ackTimer = setTimeout(() => this.fail(new SpeechError("recognition", "The local speech model stopped accepting audio.")), 5000);
        this.worker.postMessage({ type: "audio", sessionId: this.sessionId, sequence: this.waiting, sampleRate: 16000, pcm }, [pcm.buffer as ArrayBuffer]);
      } else if (this.finishing && !this.finishTimer) {
        this.finishTimer = setTimeout(() => this.fail(new SpeechError("recognition", "The local model could not complete this transcript.")), 90000);
        this.worker.postMessage({ type: "finish", sessionId: this.sessionId, hasSpeech: this.heardSpeech });
      }
    } catch (error) { this.fail(error instanceof Error ? error : new Error("Speech worker messaging failed.")); }
  }

  private fail(error: Error) {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.rejectReady?.(error);
    this.stream.end(error);
    void this.capture.dispose().catch(() => {});
  }

  async stop() { await this.capture.dispose(); }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.readyTimer);
    clearTimeout(this.finishTimer);
    clearTimeout(this.ackTimer);
    this.rejectReady?.(new Error("Speech session cancelled."));
    this.stream.end();
    this.queued = [];
    if (this.worker) { this.worker.onmessage = this.worker.onerror = null; this.worker.terminate(); }
    await this.capture.dispose();
  }
}
