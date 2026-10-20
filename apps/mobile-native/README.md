# Spndrr native mobile

React Native / Expo SDK 57 financial workspace. This is a separate native app, with no WebView or Next.js presentation dependency. The existing `apps/mobile` Capacitor app and web app remain available during release acceptance.

Implemented: native auth/privacy, five bottom tabs, dashboard/budget/category summaries, paginated history/search/filters/trash/detail, structured entry/edit and special financial events, full supported account/category forms, goals/contributions/asynchronous plans, commitments, insights/reports, household scope/roles/invitations, preferences, native JSON export and account deletion. The assistant supports reviewed dictation, clarification and encrypted on-device conversation previews. Runtime evidence and remaining API/release gaps are listed in [native-migration.md](../../docs/mobile/native-migration.md).

## Quick start

From this directory, with Node 24 and npm:

```powershell
Copy-Item .env.example .env
# Set EXPO_PUBLIC_API_URL in .env to the actual HTTPS API origin, without /api.
npm ci
npm run check:dependencies
npm run typecheck
npm run test:core
npm run test:services
npm test
npm run android
```

The native lockfile was resolved by GitHub CI and committed separately from the web's pnpm lock. Use `npm ci` for reproducible installs. Hosted installation and Expo's dependency compatibility check have run successfully; full native checks and device acceptance remain in progress. See the validation report for exact evidence.

`npm run android` generates and compiles a development client with Android Studio/JDK installed. Subsequent JavaScript changes use `npm start`. Expo Go cannot validate the native cookie module. Native HTTP is restricted to HTTPS. No backend API keys, signing secrets, or credentials belong in `EXPO_PUBLIC_*` variables.

The existing backend must also advertise an HTTPS `Product:PublicWebUrl` for its public privacy-policy link. The native consent gate loads that current policy/version from the API and does not enable acceptance if the metadata is unavailable or unverifiable. A backend development profile that advertises `http://localhost:3000` needs a separate environment-configuration follow-up; this migration does not alter backend or web configuration.

This app intentionally uses its own npm dependency boundary. Existing root `mobile:*` commands continue to target Capacitor. The shared package is a local file dependency included from the repository root. Do not run the native app's dependency installation against the web package.

For Windows/iPhone cloud builds, EAS project linking, signing, TestFlight, cloud simulator testing, and costs, follow [windows-development.md](../../docs/mobile/windows-development.md). For profiling and exact validation evidence, see [performance.md](../../docs/mobile/performance.md).

## QA builds

The `e2e` EAS profile builds a separately identified `com.spndrr.app.rn.e2e` binary with a deterministic in-process contract fixture. It accepts `qa@example.test` / `fixture-only`; these are test values, not backend credentials. Production and preview profiles cannot enable that transport.

```powershell
$env:APP_VARIANT="e2e"
$env:EXPO_PUBLIC_E2E="1"
npm run android
```

The QA fixture supports `simulate lost response` in a manual note (commits once, loses the first response), `simulate validation` (400 without a save), and assistant message `simulate failure` (unknown outcome). Its in-memory server state resets when the process restarts; it cannot establish real backend or native-cookie persistence correctness. Transaction acceptance covers entry, exact credit-card/category choice, editing, clarification and failure reconciliation. Workspace acceptance traverses tabs, goals/contributions/plans, accounts/categories, insights/settings and read-only household switching. The QA plan is deterministic and never calls an external model.

`simulate history` seeds 10,000 QA records with cooperative scheduling. `simulate slow response` in a manual note acknowledges its committed record after ten seconds. The performance flow scrolls the paginated history and repeats six composer/keyboard/category-selection cycles; native frame/memory evidence is retained separately from functional assertions.

The iOS CI workflow additionally prepares an isolated local .NET/PostgreSQL backend. Only the QA binary recognizes `spndrr-native://qa?api=https%3A%2F%2Flocalhost%3A7443`; the encrypted selection survives process restart so the native cookie adapter can be tested. No external origin is accepted. `spndrr-native://qa?fixture=1` returns that QA installation to fixtures on a cold launch. Non-QA builds never inspect or restore this test routing. A one-day test certificate is trusted only in the disposable CI simulator; there are no production ATS/TLS exceptions. `native-backend.yml` verifies native login, exact-card purchase/edit, process restart restoration and logout; a separate API read checks that exactly one edited record exists. This scenario is configured, not yet a passing result.

## Storage and financial writes

Access tokens are held in memory. An adapter persists only the existing auth cookies in SecureStore and restores them into the platform networking jar for auth requests. The app has one API jar and no embedded web sessions. Android's cookie API loses attribute metadata, so restoration applies the existing HTTPS-only `/api/auth` policy; the API remains authoritative for expiry/revocation. This needs actual Android/iOS acceptance testing.

Drafts are encrypted and scoped by API origin, owner and household (the personal workspace retains its compatible original key). Two storage banks commit a manifest only after all chunks are written. Draft changes are saved after 300 ms of idle typing and on backgrounding; transaction-operation markers are durably written before sending. A force kill within the debounce window can lose the last few keystrokes. Saved-record edits remain in memory and prompt before discarding. New financial forms also guard navigation while saving and confirm before discarding changes.

Manual creation requires an active account because the backend's existing reference deduplication is account-bound. An uncertain submission retains its original immutable payload. Assistant messages can save immediately and have no idempotency contract: no automatic resend, background queue, or offline success claims. A receipt is shown only after a validated server response.

Endpoints without a deduplication contract use a separate encrypted write marker before crossing the network boundary. An unknown create/edit/contribution outcome blocks another change until the user refreshes and explicitly reviews saved data in the original household. Household viewing can change for reconciliation; writes stay blocked. Signout removes the active unsent transaction draft and conversation preview but retains an unresolved safety marker under its original owner/API scope. A different user never restores that marker. No financial change is sent by the marker itself.

Asynchronous planning stores returned run IDs securely, resumes polling after restart and stops background polling. Plan amounts/projections come from the server; the app presents assumptions, trade-offs and risks. Shared private-aggregate consent is an explicit per-goal action and can be revoked.

Conversation previews are encrypted and limited to 12 exchanges and a bounded storage size; long messages can be saved as labeled previews. The backend has no history-list endpoint, so this screen does not claim cross-device synchronization. JSON exports are written only on explicit action to the app's cache and opened in the native share sheet. Users can remove that temporary copy; startup, next export and normal signout also remove it. Copies saved to a chosen destination are managed there.

## Dictation

The composer uses the platform speech service, preferring on-device recognition when supported. Network-assisted recognition requires an explicit explanation and confirmation. Microphone/speech permissions are requested only on action. Final text remains editable and is never sent automatically. Cancel/background interruption suppresses late results and prevents overlapping recognizer streams. Permission denial/unavailable services leave typing available. Native module compilation and actual microphone/recognizer behavior remain separate acceptance checks.

## Directory guide

- `src/screens`: native tab, financial, planning, household, assistant and privacy screens.
- `src/ui`: native fields, currency entry, date selector, feedback, and motion primitives.
- `src/state`: scoped composer/conversation lifecycle, financial write boundary, workspace state and restored planning progress.
- `src/services`: transport/session persistence, secure storage, and restricted QA fixture.
- `__tests__`: native component tests; `tests`: dependency-free service/fault tests.
- `.maestro`: native runtime acceptance; `.eas/workflows`: optional cloud builds and simulator tests.
