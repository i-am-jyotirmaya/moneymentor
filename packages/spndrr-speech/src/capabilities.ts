export interface SpeechDeviceCapabilities {
  secureContext: boolean;
  audioCapture: boolean;
  audioWorklet: boolean;
  wasm: boolean;
  webGpu: boolean;
  persistentModelStorage: boolean;
  memoryGb?: number;
  cores?: number;
}

/** Capability hints are eligibility gates, never a guarantee of inference speed. */
export function detectSpeechCapabilities(): SpeechDeviceCapabilities {
  const nav = typeof navigator === "undefined" ? undefined : navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
  return {
    secureContext: typeof isSecureContext !== "undefined" && isSecureContext,
    audioCapture: !!nav?.mediaDevices?.getUserMedia,
    audioWorklet: typeof AudioWorkletNode !== "undefined",
    wasm: typeof WebAssembly !== "undefined",
    webGpu: !!nav?.gpu,
    persistentModelStorage: typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle,
    memoryGb: nav?.deviceMemory,
    cores: nav?.hardwareConcurrency,
  };
}
