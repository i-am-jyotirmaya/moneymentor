import { expect, test } from "@playwright/test";
import { RecognitionSpeechAdapter } from "../lib/speech-transcription";
import { assistantInputRequest, typedAssistantInput, type AssistantInput } from "../lib/assistant-input";
import { configurePlatform, getSpeechTranscription, type SpeechRecognitionLike } from "../lib/platform";
import { sanitizeImageText } from "../lib/image-text-privacy";
import { TesseractTextRecognitionAdapter } from "../lib/text-recognition";

class Recognition implements SpeechRecognitionLike {
  static last: Recognition;
  continuous = false; interimResults = false; lang = "";
  onend: SpeechRecognitionLike["onend"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onresult: SpeechRecognitionLike["onresult"] = null;
  constructor() { Recognition.last = this; }
  start() {}
  stop() { this.onend?.(); }
}
function setup() {
  const inputs: AssistantInput[] = [];
  let errors = 0; let ends = 0;
  const adapter = new RecognitionSpeechAdapter(Recognition, "test-stt", "device");
  adapter.start({ locale: "en-IN", onResult: input => inputs.push(input), onError: () => errors++, onEnd: () => ends++ });
  return { adapter, inputs, counts: () => ({ errors, ends }), recognition: Recognition.last };
}
test("voice normalizes final results into the shared submission contract", () => {
  const { inputs, recognition } = setup();
  recognition.onresult?.({ results: [{ isFinal: true, 0: { transcript: "Spent 850 at Reliance yesterday", confidence: 0.9 } }] });
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toMatchObject({ version: 1, source: "voice", text: "Spent 850 at Reliance yesterday", locale: "en-IN", acquisitionConfidence: 0.9 });
  expect(assistantInputRequest(inputs[0])).toEqual({ text: inputs[0].text, inputMode: "Voice", processingMode: "Execute", locale: "en-IN" });
  expect(assistantInputRequest(typedAssistantInput(inputs[0].text))).toMatchObject({ text: inputs[0].text, inputMode: "Text", processingMode: "Execute" });
});
test("empty, interim and duplicate results cannot submit", () => {
  const { inputs, recognition } = setup();
  recognition.onresult?.({ results: [[{ transcript: "  " }]] });
  recognition.onresult?.({ results: [{ isFinal: false, 0: { transcript: "partial" } }] });
  expect(inputs).toHaveLength(0);
  recognition.onresult?.({ results: [[{ transcript: "final" }]] });
  recognition.onresult?.({ results: [[{ transcript: "final" }]] });
  expect(inputs).toHaveLength(1);
});
test("cancellation and end invalidate late events", () => {
  const { adapter, inputs, recognition, counts } = setup();
  adapter.stop(); recognition.onresult?.({ results: [[{ transcript: "late" }]] });
  expect(inputs).toHaveLength(0); expect(counts().ends).toBe(1);
  const other = setup(); other.recognition.onend?.();
  other.recognition.onresult?.({ results: [[{ transcript: "late" }]] });
  expect(other.inputs).toHaveLength(0);
});
test("permission errors end recognition without submission", () => {
  const { inputs, recognition, counts } = setup();
  recognition.onerror?.(); recognition.onerror?.();
  expect(inputs).toHaveLength(0); expect(counts()).toEqual({ errors: 1, ends: 1 });
});
test("platform may be unavailable or replace the engine independently", () => {
  let reset = configurePlatform({ getSpeechRecognition: () => undefined, saveExport: async () => {} });
  expect(getSpeechTranscription()).toBeUndefined(); reset();
  const replacement = new RecognitionSpeechAdapter(Recognition, "future-engine", "device");
  reset = configurePlatform({ getSpeechRecognition: () => undefined, getSpeechTranscription: () => replacement, saveExport: async () => {} });
  expect(getSpeechTranscription()).toBe(replacement); reset();
});
test("image request allowlists text and defaults to preview", () => {
  const input: AssistantInput = { version: 1, source: "image", text: "₹649\nSwiggy", locale: "en-IN", acquisitionConfidence: 0.98, metadata: { engine: "tesseract", processingLocation: "browser" } };
  expect(assistantInputRequest(input)).toEqual({ text: input.text, inputMode: "Image", locale: "en-IN", processingMode: "Preview" });
  expect(assistantInputRequest(input, "server-token")).toMatchObject({ processingMode: "Execute", confirmationToken: "server-token" });
});
test("redaction preserves useful payment text", () => {
  const result = sanitizeImageText("Payment successful\r\n₹649\nSwiggy\nUPI transaction ID 625163091872\nPaid from HDFC Bank XX1234\n20 Sep 2026\nPhone +91 98765 43210\nabc@okhdfcbank");
  expect(result).toContain("₹649\nSwiggy"); expect(result).toContain("20 Sep 2026"); expect(result).toContain("HDFC Bank");
  expect(result).not.toMatch(/625163091872|XX1234|98765|abc@/);
});
test("split identifiers and dotted labels do not consume adjacent lines", () => {
  expect(sanitizeImageText("₹649\nUPI transaction ID\n625163091872\nSwiggy\n20 Sep 2026")).toBe("₹649\nUPI transaction ID [REDACTED]\nSwiggy\n20 Sep 2026");
  expect(sanitizeImageText("ref no. 625163091872\nSwiggy\n20 Sep 2026")).toBe("ref no. [REDACTED]\nSwiggy\n20 Sep 2026");
});
test("unsupported, oversized and cancelled OCR never initialize a worker", async () => {
  const adapter = new TesseractTextRecognitionAdapter();
  await expect(adapter.recognize(new Blob(["x"], { type: "image/svg+xml" }))).rejects.toThrow("PNG");
  await expect(adapter.recognize(new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "image/png" }))).rejects.toThrow("10 MB");
  const abort = new AbortController(); abort.abort();
  await expect(adapter.recognize(new Blob(["x"], { type: "image/png" }), { signal: abort.signal })).rejects.toThrow("Cancelled");
});
