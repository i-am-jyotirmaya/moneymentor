# Browser and backend speech rollout

Everyday financial dictation is the acceptance criterion. A complete utterance fixture passing does not establish general accuracy. The reported regression, “bought coffee for 30 rupees” becoming an unrelated sentence, must be measured using real recordings before choosing a production engine.

## Platform routing and user flow

| Platform | Route | Consent and submission |
| --- | --- | --- |
| Native Capacitor iOS / Android | Existing OS speech adapter, even if an old Whisper preference remains | Existing system-speech consent. Local-only remains protected because the plugin cannot enforce offline processing. Existing native final submission is preserved. |
| Browser, including Safari on iPhone | Browser speech by default; exact selected language is checked for local capability | Local-only never falls through to system or backend. Explicit language installation and system-speech consent remain. Final text is editable in Review before Send. |
| Browser with missing or inaccurate built-in speech | Explicit backend engine in Settings, or Try backend transcription in the speech prompt | Capabilities / provider disclosure first, then Allow backend transcription once, Record, Finish, Review, Send. Cancel and Stop discard the utterance. |
| Experimental browser Whisper Tiny | Existing explicit download / selection | Local inference remains available but is labelled experimental. Final review prevents automatic submission of an inaccurate result. It does not replace native mobile speech. |

Apple Notes keyboard dictation is distinct from the app's speech plugin. Native performance still needs device testing inside Spndrr; no guarantee that the model or results match Notes. The native privacy prompt also suggests keyboard dictation in the existing text box. No permission or saved privacy choice is silently upgraded.

Settings → Voice transcription → Check browser speech support checks only the selected locale's API availability. It never opens the microphone, installs a pack, or enables uploads. Browser/API availability is not an accuracy result. Test Chrome, Edge, macOS/iPhone Safari and Firefox using the matrix below; unsupported APIs should offer typing or the consented backend path.

## API contract and implementation

- Authenticated `GET /api/speech/capabilities` reports enablement, configured provider/model, disclosure, consent version and 30-second limit. No credentials or internal endpoint are returned.
- Authenticated `POST /api/speech/transcriptions` accepts raw `audio/wav`, with `X-Speech-Language` (`en-IN`, `en-US`, `hi-IN`) and `X-Speech-Upload-Consent` from capabilities. System-speech consent is insufficient. Consent version changes when provider, model or destination changes.
- The client records mono float PCM through an AudioWorklet, resamples to 16 kHz, flushes the last partial frame on Finish, then emits a canonical PCM16 WAV. Finish stops capture before upload. Cancel during capture uploads nothing; cancellation after Finish aborts the in-flight request and suppresses late results (already-sent bytes cannot be recalled).
- The endpoint caps uploads at 960,044 bytes / 30 seconds, including chunked bodies. It validates WAV headers, channel count, encoding, rate and duration from actual samples, plus audible content. Digital silence is rejected before inference. Noise can still pass the energy check: real silence/noise hallucination evaluation remains required.
- Per-caller rate limit: `RateLimits:SpeechPerMinute` defaults to 10, in addition to the existing API global limiter. `Speech:MaxConcurrent` defaults to 4 upstream calls per API instance, with no queue. Add deployment-wide limits if running several replicas.
- Upload reading has a 10-second deadline; upstream calls default to 30 seconds. The browser has a 75-second session watchdog. Busy, timeout, invalid audio and provider failure have safe user-facing errors. No upstream error body is returned or logged.
- `ISpeechTranscriber` lives in Application; WAV validation is framework-independent. Infrastructure integrates the configured provider with `HttpClient`. Endpoints do not invoke the assistant, household writes, transaction parsing, or persistence.
- Request audio stays in bounded memory and buffers are cleared after use. Spndrr does not write recording/transcript files or log their content. This is not a claim of physical memory erasure or zero vendor retention. HTTP logging is disabled on the speech client; operational tracing may record request metadata only.
- Existing auth refresh works for capabilities and audio, preserving cancellation. CORS permits the two speech headers. No credentials, model weights, or audio binaries are added to the client.

## Provider configuration

Backend transcription is **disabled by default**. Deploy the API changes and configure a provider before selecting backend speech. Native and browser built-in speech continue working without backend configuration. Keep secrets in the deployment secret store, never `NEXT_PUBLIC_*`.

Managed pilot:

```text
Speech__Enabled=true
Speech__Provider=OpenAI
Speech__Endpoint=https://api.openai.com/v1/audio/transcriptions
Speech__Model=gpt-transcribe
Speech__ApiKey=<deployment secret>
Speech__TimeoutSeconds=30
Speech__MaxConcurrent=4
RateLimits__SpeechPerMinute=10
```

This adapter uses the current completed-file API: multipart WAV + model + JSON response, with `languages[]=en` and `languages[]=hi` for English/Hindi code-switching. No prompt containing expected amounts is supplied. The server validates enabled configuration at startup. Vendor retention, region and cost controls must be decided before enabling a user pilot; the consent text explicitly identifies OpenAI and avoids promising zero retention.

Self-hosted Nemotron pilot:

```text
Speech__Enabled=true
Speech__Provider=Nemotron
Speech__Endpoint=https://speech.internal.example/v1/audio/transcriptions
Speech__Model=nvidia/nemotron-3.5-asr-streaming-0.6b
Speech__ApiKey=<inference server secret>
Speech__TimeoutSeconds=30
Speech__MaxConcurrent=4
```

Point this at a deployed NVIDIA NeMo-Speech.cpp server with Nemotron 3.5 loaded, implementing its documented OpenAI-compatible transcription subset. The integration sends WAV, `language`, model and JSON response format. `en-IN` is mapped to the model's `en-GB` locale as an initial candidate, `en-US` and `hi-IN` remain explicit. Benchmark this mapping for Indian accents. The configured server uses its loaded model, so verify `/v1/models` against `Speech__Model`; the API model field alone does not load or select Nemotron weights.

HTTP is supported for private Nemotron service networks; use HTTPS/TLS termination where needed, restrict access to the API network and supply server authentication. API redirects are disabled. The user cannot select arbitrary endpoints. No inference server is provisioned and no Nemotron weights are downloaded by this PR. Model acquisition, verified version / GGUF selection, hardware sizing, retention, inference server authentication and deployment are operator steps. Native C++ CPU support exists, but capacity and latency must be measured; do not treat “600M parameters” as a performance guarantee. NVIDIA describes this server as a local/direct-integration route; assess its suitability and NVIDIA NIM separately for production.

Official contracts verified during implementation:

- [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
- [NVIDIA NeMo-Speech.cpp HTTP transcription API](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/api.md)
- [NVIDIA server lifecycle and deployment notes](https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/server.md)
- [Nemotron 3.5 model card](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b)

## Real accuracy assessment and rollout gate

Start with `packages/spndrr-speech/tests/expense-accuracy-cases.json`. It is a phrase manifest, not claimed real-audio evidence. Record the cases on real devices with Indian accents, English, Hindi and Hinglish; include pauses, quieter continuation, close/far microphones, café noise, merchant names and 13/30/300 contrasts. Extend to at least 100 expense utterances plus a held-out silence/noise set; include multiple speakers and avoid tuning on held-out recordings.

| Environment | Capture / engine | Verify |
| --- | --- | --- |
| iOS native app | OS recognition | Accuracy, amount preservation, language, permission denial, background/route cancellation; compare separately with keyboard dictation |
| Android native app | OS recognition | Same checks, OS/provider availability, permission and microphone cleanup |
| Chrome / Edge desktop | Local browser speech when exact locale is available; system speech with consent | Exact locale availability, install, real amount accuracy; never silently change processing location |
| Safari macOS / iPhone browser | Feature detection and system speech with consent | The mobile browser is evaluated separately from the native app |
| Firefox desktop / mobile | Feature detection; consented backend when needed | Unsupported built-in APIs produce an actionable path, not a microphone loop |
| Browser → OpenAI / Nemotron | The same bounded WAVs for provider comparison | Inspect / listen to opt-in test recordings to confirm actual capture is intelligible; compare provider accuracy, no invented silence, final latency and amount errors |

Use independent human reviewers to annotate amounts actually present in each returned transcript. For each case, record one result:

```json
{"id":"coffee-30","text":"bought coffee for thirty rupees","amounts":[30],"latencyMs":1400}
```

`amounts` is the independently reviewed numeric interpretation of the ASR output, not the known gold amount copied onto the result. Empty/no-number transcripts use `[]`. Latency is Finish-to-final (include networking); measure 5–10 second clips under specified hardware/network/concurrency conditions. Keep real recordings and results out of git and use explicit consent for test uploads.

```sh
node packages/spndrr-speech/scripts/evaluate-accuracy.mjs \
  packages/spndrr-speech/tests/expense-accuracy-cases.json \
  /tmp/speech-results.json /tmp/speech-report.json
```

The evaluator requires one result per case, reports word error rate independently of exact amount rate, flags every critical amount regression and nonempty silence/noise transcript, and computes p95 latency. Proposed pilot gate: ≥98% exact amounts, all critical regressions correct, no invented text in the held-out silence/noise set, p95 ≤3 seconds for the defined workload. The small seed manifest is not sufficient to qualify production. These are acceptance targets, not achieved measurements.

Choose the provider from measured results; do not claim Nemotron or a managed API is necessarily better before this test. Retain review-first browser submission through the pilot. Do not use an LLM to reconstruct a guessed amount from corrupted ASR output.

Operational meters: `spndrr.speech.requests` (`provider`, `outcome`), `spndrr.speech.duration_ms` (`provider`) and successful `spndrr.speech.audio_minutes` (`provider`). Labels contain no user IDs, transcript, merchant, amount or audio. Failed billable upstream work can make audio-minute metrics underestimate provider billing; monitor provider billing independently. Review-correction telemetry is intentionally not collected yet; measure it in the consented pilot evaluation without shipping financial text into analytics.

## Automated validation

```sh
pnpm test:speech
pnpm --filter mobile test
pnpm --filter web exec tsc --noEmit
pnpm --filter mobile typecheck
pnpm --filter web lint
pnpm --filter mobile lint
pnpm --filter web build
NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.example pnpm --filter mobile build

dotnet test apps/api/MoneyMentor.Api.IntegrationTests/MoneyMentor.Api.IntegrationTests.csproj \
  --filter FullyQualifiedName~SpeechTests

pnpm --filter web test:e2e money-mentor.spec.ts \
  --grep 'voice|speech|microphone|backend|transcript|on-device language'
pnpm --filter mobile test:e2e \
  --grep 'voice|speech|microphone|backend|transcript|on-device language'
```

API speech tests use a test host and fake upstream provider; no PostgreSQL container or paid provider calls are required. Browser tests exercise real Web Audio capture using a deterministic synthetic MediaStream, not real ASR accuracy. Existing real Whisper fixture tests remain opt-in as documented in `LOCAL_SPEECH_RUNTIME.md`. Physical native devices, browser vendor ASR and live managed/Nemotron inference have not been tested in this environment.
