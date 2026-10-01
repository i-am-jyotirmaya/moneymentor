/** Stateful box-filter downsampling to mono float PCM; carries fractional samples across chunks. */
export class PcmResampler {
  private ratio: number;
  private weight = 0;
  private sum = 0;
  constructor(inputRate: number, outputRate = 16000) {
    if (!Number.isFinite(inputRate) || !Number.isFinite(outputRate) || outputRate <= 0 || inputRate < outputRate) throw new Error("Expected positive rates with input >= output.");
    this.ratio = inputRate / outputRate;
  }
  process(channels: readonly Float32Array[]): Float32Array {
    if (!channels.length) return new Float32Array();
    const length = channels[0].length;
    if (channels.some(channel => channel.length !== length)) throw new Error("Audio channels must have equal lengths.");
    const output: number[] = [];
    for (let i = 0; i < length; i++) {
      const sample = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
      let remaining = 1;
      while (remaining > 1e-9) {
        const take = Math.min(remaining, this.ratio - this.weight);
        this.sum += sample * take;
        this.weight += take;
        remaining -= take;
        if (this.weight >= this.ratio - 1e-9) {
          output.push(this.sum / this.ratio);
          this.sum = this.weight = 0;
        }
      }
    }
    return Float32Array.from(output);
  }
}

/** Simple energy endpoint detector. Providers may replace this with a learned VAD. */
export class SpeechEndpointDetector {
  private voiceMs = 0;
  private silenceMs = 0;
  private elapsedMs = 0;
  private speaking = false;
  private ended = false;
  private options: { sampleRate: number; threshold: number; minSpeechMs: number; silenceMs: number; maxDurationMs: number };
  constructor(options: Partial<SpeechEndpointDetector["options"]> = {}) {
    this.options = { sampleRate: 16000, threshold: 0.015, minSpeechMs: 120, silenceMs: 900, maxDurationMs: 30000, ...options };
    if (Object.values(this.options).some(value => !Number.isFinite(value) || value <= 0)) throw new Error("Endpoint settings must be positive.");
  }
  process(pcm: Float32Array): "speech-start" | "speech-end" | undefined {
    if (this.ended || !pcm.length) return;
    const ms = pcm.length * 1000 / this.options.sampleRate;
    const rms = Math.sqrt(pcm.reduce((sum, sample) => sum + sample * sample, 0) / pcm.length);
    this.elapsedMs += ms;
    if (rms >= this.options.threshold) { this.voiceMs += ms; this.silenceMs = 0; }
    else { this.silenceMs += ms; if (!this.speaking) this.voiceMs = 0; }
    if (this.elapsedMs >= this.options.maxDurationMs || (this.speaking && this.silenceMs >= this.options.silenceMs)) {
      this.ended = true;
      return "speech-end";
    }
    if (!this.speaking && this.voiceMs >= this.options.minSpeechMs) {
      this.speaking = true;
      return "speech-start";
    }
  }
}

/** Explicit local audio capture for future model adapters. No audio is persisted or uploaded. */
export class BrowserPcmCapture {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private disposed = false;
  private started = false;
  private cleanup?: Promise<void>;

  /** Prime playback during the microphone click, before asynchronous model loading loses user activation. */
  prepareAudio() {
    if (this.disposed || this.started) return;
    this.context ??= new AudioContext();
    // No microphone permission or stream is requested here. start() resumes again after capture setup.
    void this.context.resume().catch(() => {});
  }

  async start(workletUrl: string, onFrame: (pcm: Float32Array) => void) {
    if (this.started || this.disposed) throw new Error("Audio capture can only be started once.");
    this.started = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (this.disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const context = this.context ?? new AudioContext();
      this.context = context;
      await context.audioWorklet.addModule(workletUrl);
      if (this.disposed) return;
      const resampler = new PcmResampler(context.sampleRate);
      const node = new AudioWorkletNode(context, "spndrr-pcm");
      this.node = node;
      node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (!this.disposed) onFrame(resampler.process([data]));
      };
      context.createMediaStreamSource(stream).connect(node);
      // The worklet outputs silence. Connection keeps processing active without microphone feedback.
      node.connect(context.destination);
      await context.resume();
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  dispose() {
    this.disposed = true;
    return this.cleanup ??= (async () => {
      if (this.node) { this.node.port.onmessage = null; this.node.port.close(); this.node.disconnect(); }
      this.stream?.getTracks().forEach(track => track.stop());
      if (this.context && this.context.state !== "closed") await this.context.close();
    })();
  }
}
