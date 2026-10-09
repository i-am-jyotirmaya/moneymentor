/* Backend capture flushes the final partial frame before closing the microphone. */
class SpndrrPcmProcessor extends AudioWorkletProcessor {
  buffer = new Float32Array(2048);
  offset = 0;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data?.type !== "flush") return;
      if (this.offset) this.port.postMessage(this.buffer.slice(0, this.offset));
      this.offset = 0;
      this.port.postMessage({ type: "flushed" });
    };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      this.buffer[this.offset++] = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("spndrr-pcm", SpndrrPcmProcessor);
