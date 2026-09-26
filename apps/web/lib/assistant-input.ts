export type AssistantInputSource = "text" | "voice" | "image";
export type AssistantInputMode = "Text" | "Voice" | "Image";
export type AssistantProcessingMode = "Execute" | "Preview";

/** Acquisition only. Financial interpretation remains in AssistantMessageService. */
export type AssistantInput = {
  version: 1;
  source: AssistantInputSource;
  text: string;
  locale: string;
  /** Character/transcription confidence, never financial confidence. */
  acquisitionConfidence?: number;
  metadata?: {
    engine?: string;
    processingLocation: "browser" | "device";
    durationMs?: number;
  };
};
export const inputModes: Record<AssistantInputSource, AssistantInputMode> = {
  text: "Text", voice: "Voice", image: "Image",
};
export function typedAssistantInput(text: string, processingLocation: "browser" | "device" = "browser"): AssistantInput {
  return { version: 1, source: "text", text, locale: "en-IN", metadata: { processingLocation } };
}
export function assistantInputRequest(input: AssistantInput, confirmationToken?: string) {
  // Allowlist: no image bytes, object URLs, engine objects or acquisition metadata.
  return {
    text: input.text.trim(), inputMode: inputModes[input.source], locale: input.locale,
    processingMode: (input.source === "image" && !confirmationToken ? "Preview" : "Execute") as AssistantProcessingMode,
    ...(confirmationToken ? { confirmationToken } : {}),
  };
}
