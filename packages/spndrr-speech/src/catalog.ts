import type { SpeechModelManifest } from "./models.ts";

// Model URLs are immutable revisions. LFS hashes and small-file hashes were independently verified.
export const speechRuntimeId = "whisper-wasm-v2-transformers-3.8.1";
export const whisperTiny: SpeechModelManifest = {
  id: "onnx-community/whisper-tiny",
  displayName: "Whisper Tiny (English / Hindi)",
  version: "ff4177021cc41f7db950912b73ea4fdf7d01d8e7",
  runtime: "transformers.js-wasm",
  runtimeVersion: "3.8.1",
  languages: ["en", "hi"],
  streaming: false,
  files: [
  {
    "path": "onnx/decoder_model_merged_quantized.onnx",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/onnx/decoder_model_merged_quantized.onnx",
    "bytes": 30719241,
    "sha256": "25e807a962b6349356d0ea5d0dfe530b7e5bf0e2a484aeca0359d03143faddd3"
  },
  {
    "path": "onnx/encoder_model_quantized.onnx",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/onnx/encoder_model_quantized.onnx",
    "bytes": 10124990,
    "sha256": "2af4a414ca47aa30f61246017e5fe82b0a8d229281d1255ba666a2a7f6b84d19"
  },
  {
    "path": "config.json",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/config.json",
    "bytes": 2243,
    "sha256": "46aeea0a406afbeb563fc8e59ca10609203df4299af6a83f73752fef369efd2d"
  },
  {
    "path": "generation_config.json",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/generation_config.json",
    "bytes": 3772,
    "sha256": "f5c67e5a4f7102f8cb4d058bc95da276bbc19eeec997267c3bb0f25ef68facd1"
  },
  {
    "path": "tokenizer.json",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/tokenizer.json",
    "bytes": 2480466,
    "sha256": "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"
  },
  {
    "path": "tokenizer_config.json",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/tokenizer_config.json",
    "bytes": 282683,
    "sha256": "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce"
  },
  {
    "path": "preprocessor_config.json",
    "url": "https://huggingface.co/onnx-community/whisper-tiny/resolve/ff4177021cc41f7db950912b73ea4fdf7d01d8e7/preprocessor_config.json",
    "bytes": 339,
    "sha256": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d"
  }
],
};
export const whisperModelBytes = whisperTiny.files.reduce((total, file) => total + file.bytes, 0);
