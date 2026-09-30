# Spndrr local speech runtime

## Scope and rollout status

This change builds the client speech foundation and integrates it into the existing assistant. It does not bundle or enable Moonshine, Whisper, or Nemotron inference. Browser-managed on-device recognition is usable when the browser supports it and the selected language is installed. The Capacitor app retains its system recognizer as a separately authorized compatibility provider.

| Requirement | Status | Implementation |
| --- | --- | --- |
| Shared, model-independent provider and transcript contracts | Done | `packages/spndrr-speech/src/contracts.ts` |
| One utterance per session; interim preview; final-only assistant submission | Done | Shared service, browser adapter, and `use-speech-input.ts` |
| Explicit privacy policy and truthful processing metadata | Done | `local-only` default; system provider labeled `system`, never `local` |
| Browser on-device ASR and explicit language installation | Done | `processLocally=true`, `available`, `install` |
| Capacitor system adapter and background cancellation | Done | Existing plugin, no native dependency in the web package |
| Microphone release on completion, error, stop, navigation, background, signout and unmount | Done | Provider disposal, generation guards, native app-state interruption |
| Model manifests and device capability detection | Done | Versioned runtime/assets, byte sizes, SHA-256, language and capability gates |
| Persistent verified model assets; progress, retry, resume and deletion | Done, infrastructure only | IndexedDB storage and `SpeechModelManager`; no downloadable model catalog is shipped |
| Mono 16 kHz PCM, audio worklet, energy endpoint detector | Done, infrastructure only | Explicit `BrowserPcmCapture`; currently used only when a worker provider is registered |
| Worker initialization, bounded buffering, session IDs and resource release | Done, infrastructure only | `WorkerTranscriptionProvider` and worker message contract |
| Lightweight downloadable model and its inference worker | Pending, next phase | Select and benchmark a model, pin all assets and implement decoding |
| Native local inference | Pending | Capacitor bridge to a supported native engine; not a React Native implementation |
| Nemotron high-end provider | Pending | Verify runtime, licensing, language coverage and memory/performance on supported devices |
| Model selector and automatic model choice | Pending | No unvalidated accuracy tiers or fabricated download sizes are exposed |
| Neural VAD, hotwords, talkback and barge-in | Pending | Build after validating real local inference |

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
- Navigation, household changes, session changes, closing the desktop chat, hidden pages and native backgrounding invalidate pending callbacks. A 45-second UI watchdog also cancels stuck sessions.

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

The worklet currently ships with the web app. Native model capture needs its own native capture/inference bridge; the mobile system recognizer does not consume this worklet.

## Validation and next-phase acceptance

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

Verified for this foundation: 21 shared runtime tests; the web regression suite (64 passed, 32 expected platform-specific skips); the additional persisted/revoked privacy preference test; IndexedDB persistence on desktop and mobile browser profiles; four mobile configuration tests; TypeScript checks for the package/web/mobile; web lint; and both production builds. Browser verification used a temporary packaged Chromium because the configured browser CDN returned invalid archives. Native Android/iOS recognition, real speech model accuracy and OS permission behavior require real-device verification.

Before enabling the first downloadable model, measure cold/warm load time, time to first partial, final latency, peak memory, sustained real-time factor, battery use and expense/amount transcription errors on Android, iOS and representative browsers. Include English (India), Hindi, mixed-language phrases, ₹ amounts, merchant names, silence, background noise, denied permission, backgrounding, model eviction and offline restart. Add IndexedDB quota/eviction and native-device lifecycle tests; mock recognition does not establish model accuracy or OS permission behavior.

## References

- [VS Code voice support](https://code.visualstudio.com/docs/configure/accessibility/voice)
- [Web Speech on-device recognition](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [SpeechRecognition.processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally)
- [SpeechRecognition.available](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static)
- [SpeechRecognition.install](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/install_static)
- [Installed Capacitor speech plugin](https://github.com/capacitor-community/speech-recognition)
