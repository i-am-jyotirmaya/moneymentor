# Assistant input pipeline — Phase 1

Typed input, browser/Capacitor speech recognition and local screenshot OCR all produce `AssistantInput`, enter `submitAssistantInput`, and call the existing `POST /api/assistant/messages`. `AssistantMessageService` remains responsible for classification, finance questions, goals, expense/income parsing, clarification and persistence. There is no media-specific financial processor.

## Acquisition contract

```ts
type AssistantInput = {
  version: 1;
  source: "text" | "voice" | "image";
  text: string;
  locale: string;
  acquisitionConfidence?: number;
  metadata?: {
    engine?: string;
    processingLocation: "browser" | "device";
    durationMs?: number;
  };
};
```

The contract is in `apps/web/lib/assistant-input.ts`. Engine-specific results stop at the acquisition adapters. Acquisition confidence describes characters/transcription, not financial interpretation; it is never combined with the existing parser's semantic confidence. `assistantInputRequest` allowlists text, locale, InputMode, ProcessingMode and an optional confirmation token. Media bytes, URLs and engine objects cannot enter the request through it.

`source` maps directly to the existing `InputMode`: text → Text, voice → Voice, image → Image. Backend Image was appended after System to preserve persisted enum values. Existing API clients default to Execute.

## Speech

`SpeechTranscriptionAdapter` in `apps/web/lib/speech-transcription.ts` has:

```ts
interface SpeechTranscriptionAdapter {
  start(options: SpeechOptions): void;
  stop(): void;
}
```

`SpeechOptions` contains locale, `onResult(input: AssistantInput)`, `onEnd()` and `onError()`. `RecognitionSpeechAdapter` wraps existing browser SpeechRecognition and the existing Capacitor community SpeechRecognition implementation. Final transcripts still automatically submit. Empty/interim/duplicate results and results after stop/end are ignored. The listening panel, stop action, unavailable-recognition message and permission/error handling remain.

A future Moonshine or Sherpa-ONNX adapter implements this interface and is returned by `configurePlatform(...).getSpeechTranscription`. Assistant API, classification, expense/income processors and persistence require no changes. `processingLocation` identifies where the adapter runs; current browser/OS speech services may themselves use network services. This PR does not claim fully local speech recognition.

## Images and OCR

The assistant page and floating composer support selecting PNG/JPEG/WebP files, pasting an image and dropping an image onto the composer. One image is active at a time; the limit is 10 MB. States are selected, reading, parsed, needs-confirmation and failed. Users can edit recognized text and preview it again.

`TextRecognitionAdapter` in `apps/web/lib/text-recognition.ts` exposes `recognize(image: Blob, options?): Promise<AssistantInput>` and `dispose(): Promise<void>`. Options include locale, cancellation and progress. `TesseractTextRecognitionAdapter` lazily loads Tesseract.js 6.0.1 and an English model, uses Tesseract's Web Worker and reuses it while available. Cancellation, initialization failures and a 90-second timeout release the worker. Empty or excessive OCR text produces an actionable error. No cloud OCR fallback exists.

`scripts/prepare-ocr-assets.mjs` copies pinned dependency assets to the selected app's `public/ocr`: worker, core JavaScript/WASM variants, and English trained data. Web/mobile dev and build commands run it; the web Docker build includes the script. Generated assets are ignored by Git and lint. At runtime all OCR requests use same-origin paths, never a third-party OCR API.

ML Kit can later implement `TextRecognitionAdapter` and be returned through `configurePlatform(...).getTextRecognition`. Native share targets would acquire a Blob and feed this seam; neither Android share intents nor iOS share extensions are implemented here.

## Shared semantic understanding

`FinanceAmountExtractor` is used by the existing expense and income parsers. Currency/amount units and nearby payment words score candidates. Balance, available, cashback, reward, saved, limit, reference and identifier contexts are excluded; labels on the preceding OCR line are supported. Dates/times are excluded. Equally plausible distinct amounts return no amount and request clarification rather than selecting a balance or guessing.

`PaymentTextSignals` recognizes Success, Failed, Pending and Unknown across all modalities. Negative state evidence wins over contradictory success text. Failed/pending input cannot persist through either the assistant or direct expense/income processors. The shared expense parser handles multiline paid-to merchant text and written dates such as 20 Sep 2026. Existing merchant/category catalogs remain authoritative for heuristic suggestions.

## Preview and confirmation

Text/voice preserve execute behavior. Explicit Preview can also be used for text/voice. Image always previews on the server, even if a caller requests Execute without a valid confirmation token.

The same classifier and existing processors understand both modes. Preview returns ExpenseDraft/IncomeDraft through existing ParsedDebug fields; it never calls transaction persistence, changes financial records or merges/saves/clears another unfinished clarification draft. Goal creation is blocked in preview. Read-only finance question routing remains available.

A complete preview receives a server-generated confirmation token. The store retains the exact parsed draft and original command for ten minutes, bound to the exact authenticated subject/provider and household. Tokens are atomically consumed, expire, and cannot be replayed. A newer complete preview replaces the prior token in that scope. The store is bounded to 2,000 entries.

The user chooses Track expense/Track income; unknown payment status instead requires Confirm completed & track. Only this action sends Execute with the token. Confirmation invokes the existing processor and transaction service with the exact server-held draft, preserving the reviewed amount, merchant and date. Changed client text or transaction fields cannot replace it. Persistence still performs existing authorization and validation. Edited OCR text always requests another Image Preview.

Tokens use an in-memory single-instance store, consistent with existing clarification stores. Multiple backend instances require sticky routing or a shared atomic store. Tokens are consumed before saving: if the response is lost, check transactions before creating another preview. Restarts invalidate previews. This is not durable exactly-once processing across different tokens or repeated screenshots.

## Privacy and lifecycle

Original image bytes never go to the backend, S3 or a database. The image stays in browser memory with a temporary object URL. Dismissal, confirmation, failure, household/user changes and unmount release the image/URL and dispose OCR work. Image bytes are not stored in assistant history. Sanitized text can remain in chat and the existing transaction SourceText field.

`sanitizeImageText` performs Unicode/whitespace normalization and best-effort masking of labeled transaction/reference/account/card IDs, UPI addresses, masked fragments, phone numbers and long identifiers. It runs before OCR-derived submission and after user edits. Useful amounts, merchants, dates and bank names are preserved where recognizable. It is heuristic, not a guarantee that every sensitive identifier will be detected. Crop unnecessary details and review the result for sensitive or misread text.

There are no content logs for OCR or microphone input. Local performance entries use only timings: ocrDurationMs, assistantProcessingMs and totalInputDurationMs. Acquisition confidence is not uploaded or used as transaction confidence.

OCR computation is local once its worker/WASM/model assets are available. Browser cache availability varies; this feature does not install a full offline asset cache. The existing backend still needs connectivity for understanding and saving transactions. Fully offline expense creation is not implemented.

## Validation

Run from the repository with Node 24, pnpm and .NET 10:

```sh
pnpm install --frozen-lockfile
pnpm --filter web lint
pnpm --filter web exec tsc --noEmit
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
pnpm --filter web exec playwright install chromium
pnpm --filter web exec playwright test --config playwright.unit.config.ts
pnpm --filter web test:e2e
dotnet test apps/api/MoneyMentor.Application.Tests
dotnet test apps/api/MoneyMentor.Api.IntegrationTests
pnpm --filter web build
NEXT_PUBLIC_API_BASE_URL=https://api.spndrr.example pnpm --filter mobile build
```

API integration tests require Docker/PostgreSQL. CI also builds both production containers. `MultimodalAssistantTests` uses the actual shared classifier/parser/processors with recording persistence to verify preview, confirmation, token ownership/expiry/replay, payment states and draft isolation. `PaymentTextParsingTests` covers amount selection. `AssistantPreviewTests` verifies preview/confirmation against the API/database. Acquisition tests cover speech lifecycle, request allowlisting and redaction; browser tests exercise actual local Tesseract selection/paste, edits, confirmation and URL cleanup.

English-only OCR, noisy layouts, multiple payments, ambiguous amounts and dates remain heuristic limitations. Native physical-device microphone/OCR testing remains a release follow-up. This phase adds no image storage, receipt history, server OCR, local NLU, Moonshine/Sherpa engine migration or OS share target.
