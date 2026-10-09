/** Canonical 16 kHz mono PCM16 WAV. No compression or sample-rate metadata guesswork. */
export function encodeSpeechWav(frames: readonly Float32Array[]): Uint8Array {
  const samples = frames.reduce((total, frame) => total + frame.length, 0);
  if (!samples || samples > 480000) throw new Error("Recording must contain up to 30 seconds of audio.");
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const frame of frames) for (const value of frame) {
    if (!Number.isFinite(value)) throw new Error("Invalid microphone sample.");
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return bytes;
}
