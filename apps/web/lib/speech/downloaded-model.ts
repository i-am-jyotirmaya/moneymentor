import { BrowserPcmCapture, detectSpeechCapabilities, IndexedDbSpeechModelStorage, SpeechError, SpeechModelManager, WorkerTranscriptionProvider, whisperTiny, speechRuntimeId } from "../../../../packages/spndrr-speech/src/index";
import { deleteSpeechRuntime, installSpeechRuntime, loadSpeechRuntime, isSpeechRuntimeInstalled } from "../../../../packages/spndrr-speech/src/runtime-assets";
import type { SpeechInferenceWorker } from "../../../../packages/spndrr-speech/src/worker-provider";

const storage = new IndexedDbSpeechModelStorage();
const models = new SpeechModelManager(storage);
export const modelChanged = "spndrr-speech-model";
type DownloadState = { installed: boolean; busy: boolean; message: string; bytes: number; total: number; error: string };
const initial: DownloadState = { installed: false, busy: false, message: "Checking this device…", bytes: 0, total: 0, error: "" };
let state = initial;
let controller: AbortController | undefined;
const subscribers = new Set<() => void>();
function update(next: Partial<DownloadState>) { state = { ...state, ...next }; subscribers.forEach(callback => callback()); }
export const modelDownloadSnapshot = () => state;
export const modelDownloadServerSnapshot = () => initial;
export function subscribeModelDownload(callback: () => void) { subscribers.add(callback); return () => { subscribers.delete(callback); }; }
export function supportsDownloadedSpeech() { return typeof Worker !== "undefined" && typeof URL.createObjectURL === "function" && models.getCompatibleModels([whisperTiny], detectSpeechCapabilities()).length === 1; }

export async function refreshDownloadedModel() {
  if (state.busy) return;
  try {
    const installed = await models.isModelInstalled(whisperTiny) && await isSpeechRuntimeInstalled(storage);
    if (!state.busy) update({ installed, message: installed ? "Ready on this device" : "Not downloaded" });
  } catch { if (!state.busy) update({ installed: false, message: "Model storage is unavailable on this device." }); }
}

export async function installDownloadedModel() {
  if (state.busy) return false;
  if (!supportsDownloadedSpeech()) { update({ error: "This device does not support local model recording. Keep typing or explicitly choose system speech." }); return false; }
  const operation = new AbortController();
  controller = operation;
  update({ busy: true, error: "", message: "Downloading local runtime…", bytes: 0, total: 0 });
  try {
    // A denied persistence request is harmless; the cache still works but may be evicted.
    await navigator.storage?.persist?.().catch(() => false);
    await installSpeechRuntime(storage, `/speech/${speechRuntimeId}`, {
      signal: operation.signal, onProgress: (bytes, total) => update({ bytes, total }),
    });
    update({ message: "Downloading Whisper Tiny…", bytes: 0, total: 0 });
    await models.downloadModel(whisperTiny, {
      signal: operation.signal, onProgress: (bytes, total) => update({ bytes, total }),
    });
    update({ installed: true, message: "Ready on this device", error: "" });
    window.dispatchEvent(new Event(modelChanged));
    return true;
  } catch (error) {
    update({ message: operation.signal.aborted ? "Download paused. Resume to continue." : "Download incomplete", error: operation.signal.aborted ? "" : error instanceof Error ? error.message : "Download failed. Check free storage and try again." });
    return false;
  } finally { controller = undefined; update({ busy: false }); }
}
export function cancelModelDownload() { controller?.abort(); }

export async function deleteDownloadedModel() {
  if (state.busy) return;
  update({ busy: true, error: "", message: "Deleting model…" });
  window.dispatchEvent(new Event(modelChanged));
  try {
    await models.deleteModel(whisperTiny);
    await deleteSpeechRuntime(storage);
    update({ installed: false, message: "Not downloaded", bytes: 0, total: 0 });
  } catch (error) { update({ error: error instanceof Error ? error.message : "Model could not be deleted." }); }
  finally { update({ busy: false }); }
}

async function createLocalWorker(onWorklet: (url: string) => void): Promise<SpeechInferenceWorker> {
  let files: Record<string, Uint8Array>;
  try { files = await loadSpeechRuntime(storage); }
  catch (error) { throw new SpeechError("download-required", error instanceof Error ? error.message : "Install the local speech runtime."); }
  const urls: string[] = [];
  const url = (bytes: Uint8Array, type: string) => {
    const value = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type })); urls.push(value); return value;
  };
  try {
    const wasm = url(files["ort-wasm-simd-threaded.jsep.wasm"], "application/wasm");
    const mjs = url(files["ort-wasm-simd-threaded.jsep.mjs"], "text/javascript");
    const script = new TextEncoder().encode(`globalThis.__spndrrWasmPaths=${JSON.stringify({ wasm, mjs })};\n${new TextDecoder().decode(files["worker.js"])}`);
    onWorklet(url(files["pcm-worklet.js"], "text/javascript"));
    const worker = new Worker(url(script, "text/javascript"), { type: "module", name: "spndrr-local-whisper" });
    const terminate = worker.terminate.bind(worker);
    worker.terminate = () => { terminate(); urls.forEach(value => URL.revokeObjectURL(value)); };
    return worker;
  } catch (error) { urls.forEach(value => URL.revokeObjectURL(value)); throw error; }
}

export function downloadedTranscriptionProvider() {
  if (!supportsDownloadedSpeech()) throw new SpeechError("unavailable", "This device cannot record with a downloaded model. Keep typing or choose system speech.");
  const capture = new BrowserPcmCapture();
  capture.prepareAudio();
  let workletUrl = "";
  return new WorkerTranscriptionProvider({
    id: "whisper-tiny-wasm", manifest: whisperTiny, models,
    createWorker: () => createLocalWorker(url => { workletUrl = url; }),
    capture: { start: (_url, frame) => capture.start(workletUrl, frame), dispose: () => capture.dispose() },
    workletUrl: `/speech/${speechRuntimeId}/pcm-worklet.js`,
  });
}
