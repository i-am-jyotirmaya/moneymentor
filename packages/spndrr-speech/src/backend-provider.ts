import { BrowserPcmCapture } from "./audio.ts";
import { SpeechError } from "./contracts.ts";
import type { TranscriptionEvent, TranscriptionOptions, TranscriptionProvider } from "./contracts.ts";
import { SpeechEventStream } from "./event-stream.ts";
import type { PcmAudioSource } from "./worker-provider.ts";
import { encodeSpeechWav } from "./wav.ts";

type BackendOptions = {
  model: string;
  workletUrl: string;
  capture?: PcmAudioSource;
  upload: (wav: Uint8Array, language: string, signal: AbortSignal) => Promise<{ text: string }>;
};

/** Explicit upload only; finish freezes capture, cancel never commits buffered audio. */
export class BackendTranscriptionProvider implements TranscriptionProvider {
  readonly id = "backend-speech";
  readonly location = "cloud" as const;
  readonly model: string;
  private options: BackendOptions;
  private capture: PcmAudioSource;
  private events = new SpeechEventStream();
  private controller = new AbortController();
  private frames: Float32Array[] = [];
  private samples = 0;
  private voicedSamples = 0;
  private language = "en-IN";
  private started = false;
  private recording = false;
  private finishing = false;
  private acceptingFrames = true;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(options: BackendOptions) {
    this.options = options; this.model = options.model;
    this.capture = options.capture ?? new BrowserPcmCapture();
    if (this.capture instanceof BrowserPcmCapture) this.capture.prepareAudio();
  }
  async initialize(options: TranscriptionOptions) {
    if (options.privacy !== "allow-backend") throw new SpeechError("privacy", "Allow backend transcription before uploading audio.");
    this.language = options.language;
  }
  start(): AsyncIterable<TranscriptionEvent> {
    if (this.started || this.disposed) throw new Error("Recording can only start once.");
    this.started = true;
    void this.capture.start(this.options.workletUrl, frame => {
      if (this.disposed || !this.acceptingFrames) return;
      const remaining = 480000 - this.samples;
      const pcm = frame.slice(0, remaining);
      if (pcm.length) {
        this.frames.push(pcm); this.samples += pcm.length;
        const rms = Math.sqrt(pcm.reduce((total, sample) => total + sample * sample, 0) / pcm.length);
        if (rms >= 0.0015) this.voicedSamples += pcm.length;
      }
      if (this.samples >= 480000) void this.finish();
    }).then(() => {
      if (this.disposed || this.finishing) return;
      this.recording = true;
      this.events.push({ type: "recording" });
      this.timer = setTimeout(() => void this.finish(), 30000);
    }).catch(error => { if (!this.disposed) this.events.end(error instanceof Error ? error : new Error("Microphone failed.")); });
    return this.events;
  }
  async finish() {
    if (!this.started || !this.recording || this.finishing || this.disposed) return;
    this.finishing = true; clearTimeout(this.timer);
    this.events.push({ type: "speech-end" });
    try {
      await this.capture.finish?.();
      this.acceptingFrames = false;
      await this.capture.dispose();
      if (this.disposed) return;
      if (this.voicedSamples < 1920) { this.events.end(new SpeechError("recognition", "No clear speech was captured. Try again or keep typing.")); return; }
      const wav = encodeSpeechWav(this.frames);
      this.clearFrames();
      try {
        const result = await this.options.upload(wav, this.language, this.controller.signal);
        if (!result.text.trim()) throw new SpeechError("recognition", "No transcript was returned. Try again or keep typing.");
        if (!this.disposed) this.events.push({ type: "final", text: result.text, language: this.language });
      } finally { wav.fill(0); }
      this.events.end();
    } catch (error) { if (!this.disposed) this.events.end(error instanceof Error ? error : new Error("Transcription failed.")); }
    finally { this.clearFrames(); }
  }
  private clearFrames() { this.frames.forEach(frame => frame.fill(0)); this.frames = []; }
  async stop() { await this.capture.dispose(); }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.timer); this.controller.abort(); this.clearFrames(); this.events.end();
    await this.capture.dispose();
  }
}
