# Spndrr local speech runtime

## Scope and rollout status

The foundation now has a concrete downloadable model: multilingual Whisper Tiny q8. Browser / device speech remains the default to preserve existing behavior; Settings and the microphone prompt offer an explicit download and selection. The same worker and UI ship in the Capacitor static export. No native inference bridge is introduced.

| Capability | Current behavior |
| --- | --- |
| Model | `onnx-community/whisper-tiny`, immutable revision `ff4177021cc41f7db950912b73ea4fdf7d01d8e7` |
| Download size | 41.6 MiB model assets plus approximately 21.8 MiB runtime / notices |
| Languages exposed | English (India / US), Hindi (India); selected explicitly, transcription rather than translation |
| Runtime | Transformers.js 3.8.1, its ONNX Runtime Web WASM distribution; one thread, no WebGPU requirement |
| Streaming | Buffered utterance decoding after a pause; no live Whisper partials |
| Audio | Mono 16 kHz PCM, energy endpointing, at most 30 seconds; no audio persistence or upload |
| Installation | Explicit download, byte progress, pause/resume, integrity checks, storage persistence request, repair and deletion |
| Offline inference | Model, worker, WASM, module factory and audio worklet all read from verified IndexedDB data and blob URLs |
| Privacy | No automatic system / cloud fallback; only final transcript goes to the existing assistant endpoint |
| Mobile | WASM worker in supported Capacitor WebViews; production export verified, physical Android / iOS validation outstanding |

To use it: open Settings → Voice transcription → Download / resume Whisper Tiny. After installation it is selected for this device. Tap the microphone, wait for “Recording”, speak a sentence, then pause. Loading and final decoding have distinct status messages. Stop cancels the utterance; it never submits an interim result. A missing or damaged cache offers reinstall before recording. Browser language-pack installation and the explicitly authorized system provider remain available.

The catalog is in `packages/spndrr-speech/src/catalog.ts`, asset building in `scripts/build-assets.mjs`, decoding in `apps/web/lib/speech/whisper-worker.ts`, and installation / worker construction in `apps/web/lib/speech/downloaded-model.ts`. Runtime files are generated before web and mobile development / builds, included in Docker / static exports, and excluded from git and lint. Bump `speechRuntimeId` when changing the worker protocol, runtime, or cached worker implementation so older installations cannot reuse incompatible assets.

Model weights / configuration files are pinned by revision, byte size and SHA-256. Runtime metadata is generated from the app's installed dependency distribution, fetched from the app's own origin on explicit installation, stored with the files and checked before every load. Model assets use the independent immutable catalog hashes. Transformers model-hub access, browser cache, filesystem cache and automatic remote model loading are disabled inside the worker; missing optional files resolve to local 404 responses. The single-threaded WASM runtime uses cached module / WASM blob URLs, without CDN requests or cross-origin isolation headers.

Licenses: Whisper MIT (OpenAI), Transformers.js Apache-2.0 (Hugging Face), ONNX Runtime MIT (Microsoft). The model / ONNX licenses and the ONNX third-party notices at runtime commit `89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0` are retained in `packages/spndrr-speech/licenses`. Builds combine them with the Transformers license into a cached `licenses.txt` asset. Sources: [model card](https://huggingface.co/onnx-community/whisper-tiny), [Transformers.js](https://github.com/huggingface/transformers.js/tree/3.8.1), [ONNX Runtime](https://github.com/microsoft/onnxruntime/tree/89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0).

## Boundary with the assistant

`microphone → provider → TranscriptionResult → submitChatMessage(text, "Voice") → existing assistant API`

The backend request and financial interpretation remain unchanged. Neither microphone audio nor model files are sent to the Spndrr API. The service returns original `rawText`, whitespace-normalized `text`, language, session duration and processing metadata. The UI sends only the completed text through the existing `inputMode: Voice` flow. Processing metadata stays client-side for now; it is not persisted as backend analytics.

Normalization intentionally does not turn “four fifty” into ₹450 or infer a merchant. That interpretation belongs to the assistant and its existing validation rules. Raw PCM is transient; it is not recorded to IndexedDB or logged.

The browser provider combines the current result list for preview and waits until all results are final. The native compatibility adapter retains one-shot recognition with partial results disabled. The model worker must emit a single utterance-level `final`, not separate finals for every chunk. The service consumes at most one final per session.

## Privacy and user behavior

- Settings → Voice transcription defaults to **Keep audio on this device** and English (India). Preferences are versioned and stored on the current device.
- A browser without enforceable local recognition cannot start its microphone in local-only mode. A missing language opens a dialog with an explicit download action.
- **Use system speech once** authorizes only that recording. The next recording starts with the saved privacy policy again.
- **Allow system speech (may use cloud)** is an explicit persistent compatibility choice. Both the browser and the OS recognizer may use their own remote speech service. Spndrr cannot assert offline processing for them.
- Recognition failures never automatically select another provider. Users may retry or type; an unsupported local provider offers the separately authorized system option.
- Completing a language download closes the dialog; the user presses the microphone again. Downloading a language does not request microphone access or automatically start recording.
- Stop cancels and discards interim speech. Completed utterances submit automatically, preserving the existing assistant behavior. Typing/submitting a message cancels an active voice session.
- Navigation, household changes, session changes, closing the desktop chat, hidden pages and native backgrounding invalidate pending callbacks. UI watchdogs cancel stuck sessions: 45 seconds for browser / device speech, 210 seconds for a downloaded model.

Browser/OS permission persistence is controlled by that platform. This code releases recording resources but cannot force a browser to remember a microphone grant.

## Provider contract

Each provider instance is single-use and owns its resources:

```ts
interface TranscriptionProvider {
  readonly id: string;
  readonly model: string;
  readonly location: "local" | "system" | "cloud";
  initialize(options: TranscriptionOptions): Promise<void>;
  start(): AsyncIterable<TranscriptionEvent>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
```

`LocalTranscriptionService` rejects a nonlocal provider before initialization under `local-only`. It normalizes a final result and disposes the provider in `finally`, including setup failures. Cancellation also guards asynchronous initialization; a late availability/permission result cannot start a cancelled session. UI generation checks discard old results after navigation or cancellation.

The Capacitor plugin has a single native recognizer. Its adapter holds ownership until an outstanding start call has settled, preventing old cancellation callbacks from stopping a newer session. If a platform never settles that call after Stop, a subsequent attempt shows that the previous session is still closing. Real-device testing must verify this behavior before distribution.

## Model assets and lifecycle

`SpeechModelManager` receives an explicitly supplied manifest and storage adapter. A manifest pins model ID/version, runtime/version, language list, streaming support and every file's HTTPS URL, exact bytes and SHA-256. No community conversion URL or estimated size is treated as a shipping artifact.

Downloads run only when the caller requests them. Progress reports downloaded/total bytes. Partial bytes are saved periodically and on interruption. Retrying requests a byte range and optionally `If-Range` with the saved ETag. A `206` response must start at the requested offset and preserve the ETag; a `200` response restarts safely. Unsupported CORS/range configurations fail explicitly. A manifest/hash change prevents reusing stale bytes.

An installed marker is written only after every file has passed size/hash verification. A new version gets its own cache namespace. `loadModel` re-verifies all cached files before returning assets, so an evicted or corrupted file cannot be loaded just because metadata says “installed.” Delete removes the version's marker and its assets. Storage/quota errors propagate to the caller; the app does not silently upload audio or switch providers.

Runtime memory and persistent assets have separate ownership. The manager stores/downloads bytes; the provider loads the runtime. Disposing the worker terminates inference and releases its loaded model. Deleting an installed model is a separate user action.

The initial manager is an in-memory download/verification path with a default **256 MiB total asset budget**. SHA-256 and loading require whole buffers and storage checkpoints copy data. Large-model support needs chunked storage and incremental hashing before increasing this budget. Browser storage may be evicted; persistent-storage requests, disk-space estimates, cross-tab download coordination and a management UI are follow-ups. The current operation lock applies to one manager instance.

Browser-managed language packs use the browser's installation API, not the application's IndexedDB cache. Their byte count, hash, resume policy and deletion are controlled by the browser and are not represented as app-managed model assets.

## Local audio and worker integration

Future browser model adapters use `BrowserPcmCapture` to request mono audio explicitly, load `/speech/pcm-worklet.js`, and resample the actual AudioContext rate to 16 kHz. Fractional samples carry across frames; stereo input is averaged. The worklet outputs silence to avoid feeding microphone audio to the speakers. Disposal stops every microphone track and closes the worklet/context even during asynchronous setup.

The supplied endpoint detector is an energy threshold, not a learned speech classifier: speech starts after 120 ms over threshold, ends after 900 ms silence, and recording is bounded to 30 seconds. Thresholds need device/noise testing before using a model provider in production. VAD is separate from financial parsing and can be replaced.

The worker protocol has `load`, `audio`, `finish`, and `dispose` requests and `ready`, `ack`, `event`, and `error` responses. All messages carry a session ID. Audio has a monotonic sequence and transferred mono Float32 buffers at 16 kHz. Workers acknowledge each chunk; the adapter allows one in-flight chunk and at most two seconds queued. Slow inference fails instead of discarding audio and fabricating a transcript. Endpointing stops capture and sends `finish` after queued chunks are acknowledged. Model load and finalization have bounded waits.

To add a provider:

1. Pin a verified manifest with reviewed runtime/model licenses and supported languages.
2. Implement a model-specific worker for this protocol, including streaming state, decoding, errors and utterance-level finalization. Protocol support alone does not run a model.
3. Instantiate `SpeechModelManager` with `IndexedDbSpeechModelStorage`; expose an explicit installation/progress/delete experience.
4. Use `detectSpeechCapabilities` and `getCompatibleModels` plus measured performance to gate eligibility. Unknown memory is not assumed to support a model's memory requirement.
5. Construct `WorkerTranscriptionProvider` with the manifest, manager, worker factory and worklet URL, and select it through `getTranscriptionProvider` without changing the assistant.
6. For native local ASR, implement a Capacitor bridge/provider with enforceable on-device processing, lifecycle events, final-only results and runtime-specific model loading.

The cached audio worklet and WASM worker ship with both clients. The mobile system recognizer remains separate and does not consume this worklet. A dedicated native inference bridge can replace the WebView runtime later.

## Validation

Run the shared tests from the repository root:

```sh
pnpm test:speech
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec tsc -p ../../packages/spndrr-speech/tsconfig.json
pnpm --filter mobile typecheck
pnpm --filter web lint
pnpm --filter web build
NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.example pnpm --filter mobile build
pnpm --filter web test:e2e
```

Runtime tests cover local privacy enforcement before permission/capture, partial/final separation, duplicate callbacks, cancellation during initialization, recognition errors, resampling invariance, endpointing, cache verification, interruption/resume, cancellation, corrupt storage, worker session isolation, bounded queues and worker teardown. Browser tests exercise local voice submission, the once-only system choice, explicit language installation, cancelled interim speech and navigation cleanup with fake recognition. A real IndexedDB test checks committed byte storage across reload and isolation when deleting a model version.

Real-model acceptance tests run the production installation / cache / worker / audio worklet code. One transcribes the first utterance of the public JFK recording with the browser offline after cache reload, asserts one final result and microphone cleanup, and checks that inference fetches no model, runtime or CDN assets. Another synthesizes “spent four hundred and fifty rupees on dinner” and checks the actual microphone → Whisper → assistant request, preserving the spoken amount and `inputMode: Voice`. The backend response in that test is mocked; it is not a financial parser accuracy test.

Prepare fixtures with Node 24 and FFmpeg built with `flite` (no model or audio binaries are committed):

```sh
node packages/spndrr-speech/scripts/prepare-fixtures.mjs /tmp/spndrr-speech-fixtures
pnpm --filter web speech:assets
SPNDRR_SPEECH_FIXTURE_DIR=/tmp/spndrr-speech-fixtures pnpm --filter web test:e2e
```

Without the fixture environment variable, the two expensive real-model acceptance tests explicitly skip. The ordinary regression suite still tests engine preference persistence, missing-model gating, browser local recognition, privacy choices, language installation, typing and cancellation. Shared runtime tests cover model and runtime integrity / repair, download resume, cancellation, persistence boundaries, silent endpointing, worker ownership, bounded queues and teardown.

Limitations: offline **transcription** works while the app is loaded; offline app-shell navigation / full page reopening is not supplied by this change. The assistant API still needs connectivity. Storage can be evicted, persistence can be denied, and download checkpoints can fail under quota pressure. Runtime downloads reuse completed files; model files additionally resume partial bytes where the server exposes valid Range / ETag headers. Installation is serialized within one app instance; cross-tab download locking remains a follow-up. The energy detector is not a learned VAD, and noisy audio or long pauses can affect utterance boundaries. Silence produces an empty final result instead of running Whisper. Load and decode each allow up to 90 seconds; total UI watchdog is 210 seconds. A 4 GB device is recommended; unknown device memory is allowed rather than rejecting Safari.

Before broad mobile rollout, measure real-device CPU / memory / battery behavior, denied permissions, background cancellation, Hindi and mixed-language recognition, noisy rooms, ₹ amounts and merchant names. This implementation is usable on tested Chromium; the successful Capacitor build is not evidence of physical Android / iOS inference or OS permission behavior. Native model bindings and genuine streaming ASR remain follow-ups.

## References

- [VS Code voice support](https://code.visualstudio.com/docs/configure/accessibility/voice)
- [Web Speech on-device recognition](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [SpeechRecognition.processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
- [SpeechRecognition.available](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static)
- [SpeechRecognition.install](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static)
- [Installed Capacitor speech plugin](https://github.com/capacitor-community/speech-recognition)
