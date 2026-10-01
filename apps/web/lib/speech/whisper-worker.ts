import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { SpeechWorkerRequest, SpeechWorkerResponse } from "../../../../packages/spndrr-speech/src/worker-protocol";
import { speechRuntimeId, whisperTiny } from "../../../../packages/spndrr-speech/src/catalog";

const worker = globalThis as unknown as {
  onmessage: (event: MessageEvent<SpeechWorkerRequest>) => void;
  postMessage: (message: SpeechWorkerResponse) => void;
  __spndrrWasmPaths: { mjs: string; wasm: string };
};
let sessionId = "";
let decoder: AutomaticSpeechRecognitionPipeline | undefined;
let chunks: Float32Array[] = [];
let samples = 0;
let finishing = false;
let language = "english";

// No model hub or CDN requests during inference. Even missing optional files are local 404s.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = "/verified-speech/";
env.useBrowserCache = false;
env.useFSCache = false;
env.useCustomCache = true;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = worker.__spndrrWasmPaths;

worker.onmessage = ({ data }) => {
  void handle(data).catch(() => {
    worker.postMessage({ type: "error", sessionId: data.sessionId, message: "Local speech failed. Try again, reinstall the model, or keep typing." });
  });
};

async function handle(request: SpeechWorkerRequest) {
  if (request.type === "load") {
    if (sessionId || request.manifest.id !== whisperTiny.id || request.manifest.version !== whisperTiny.version || request.manifest.runtimeVersion !== "3.8.1") throw new Error("Unsupported speech model.");
    if (!worker.__spndrrWasmPaths || !speechRuntimeId) throw new Error("Missing local runtime.");
    sessionId = request.sessionId;
    language = request.options.language.startsWith("hi") ? "hindi" : "english";
    const files = new Map(request.files.map(file => [file.path, file.bytes]));
    env.customCache = {
      async match(key: string) {
        const prefix = `${env.localModelPath}${whisperTiny.id}/`;
        const path = key.startsWith(prefix) ? key.slice(prefix.length) : "";
        const bytes = files.get(path);
        return bytes ? new Response(new Uint8Array(bytes).buffer) : new Response(null, { status: 404 });
      },
      async put() { throw new Error("Inference cannot download model files."); },
    };
    decoder = await pipeline<"automatic-speech-recognition">("automatic-speech-recognition", whisperTiny.id, { device: "wasm", dtype: "q8", local_files_only: true });
    files.clear();
    worker.postMessage({ type: "ready", sessionId });
    return;
  }
  if (request.sessionId !== sessionId || !decoder) return;
  if (request.type === "audio") {
    if (finishing || request.sampleRate !== 16000 || samples + request.pcm.length > 16000 * 31) throw new Error("Invalid audio frame.");
    chunks.push(request.pcm);
    samples += request.pcm.length;
    worker.postMessage({ type: "ack", sessionId, sequence: request.sequence });
  } else if (request.type === "finish" && !finishing) {
    finishing = true;
    const audio = new Float32Array(samples);
    let position = 0;
    for (const chunk of chunks) { audio.set(chunk, position); position += chunk.length; }
    chunks = [];
    // Silence must not produce Whisper's well-known hallucinated speech.
    const result = samples && request.hasSpeech === true ? await decoder(audio, { language, task: "transcribe", max_new_tokens: 128 }) : { text: "" };
    const text = Array.isArray(result) ? result[0]?.text ?? "" : result.text;
    audio.fill(0);
    worker.postMessage({ type: "event", sessionId, event: { type: "final", text } });
  } else if (request.type === "dispose") {
    chunks = [];
    await decoder.dispose();
    decoder = undefined;
  }
}
