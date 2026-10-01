/* Local model adapters load this worklet explicitly; system recognition does not use it. */
class SpndrrPcmProcessor extends AudioWorkletProcessor {
  buffer = new Float32Array(2048);
  offset = 0;
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
