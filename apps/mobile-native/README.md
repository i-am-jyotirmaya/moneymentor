# Spndrr native mobile

React Native / Expo SDK 57 transaction-entry implementation. This is a separate native app, with no WebView or Next.js presentation dependency. The existing `apps/mobile` Capacitor app and web app remain available during migration.

Implemented: native sign-in/refresh/privacy gate, assistant text entry and clarification, manual expense/income entry, hierarchical category/account/payment selection, account creation, confirmed receipts, saved-record editing, recent-history verification, secure draft restoration, and guarded retries. Remaining features and release gates are listed in [native-migration.md](../../docs/mobile/native-migration.md).

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

This app intentionally uses its own npm dependency boundary. Existing root `mobile:*` commands continue to target Capacitor. The shared package is a local file dependency included from the repository root. Do not run the native app's dependency installation against the web package.

For Windows/iPhone cloud builds, EAS project linking, signing, TestFlight, cloud simulator testing, and costs, follow [windows-development.md](../../docs/mobile/windows-development.md). For profiling and exact validation evidence, see [performance.md](../../docs/mobile/performance.md).

## QA builds

The `e2e` EAS profile builds a separately identified `com.spndrr.app.rn.e2e` binary with a deterministic in-process contract fixture. It accepts `qa@example.test` / `fixture-only`; these are test values, not backend credentials. Production and preview profiles cannot enable that transport.

```powershell
$env:APP_VARIANT="e2e"
$env:EXPO_PUBLIC_E2E="1"
npm run android
```

The QA fixture supports `simulate lost response` in a manual note (commits once, loses the first response), `simulate validation` (400 without a save), and assistant message `simulate failure` (unknown outcome). Its in-memory server state resets when the process restarts; it cannot establish real backend or native-cookie persistence correctness. The Maestro flow covers manual entry, exact credit-card selection, category selection, edit, assistant clarification, and failure reconciliation.

## Storage and financial writes

Access tokens are held in memory. An adapter persists only the existing auth cookies in SecureStore and restores them into the platform networking jar for auth requests. The app has one API jar and no embedded web sessions. Android's cookie API loses attribute metadata, so restoration applies the existing HTTPS-only `/api/auth` policy; the API remains authoritative for expiry/revocation. This needs actual Android/iOS acceptance testing.

Drafts are encrypted and scoped by API origin plus user ID. Two storage banks commit a manifest only after all chunks are written. Edits are saved after 300 ms of idle typing and on backgrounding; transaction-operation markers are durably written before sending. A force kill within the debounce window can lose the last few keystrokes. Saved-record edits remain in memory and prompt before discarding; durable restoration of an unfinished edit is outstanding.

Manual creation requires an active account because the backend's existing reference deduplication is account-bound. An uncertain submission retains its original immutable payload. Assistant messages can save immediately and have no idempotency contract: no automatic resend, background queue, or offline success claims. A receipt is shown only after a validated server response.

## Directory guide

- `src/screens`: native transaction, receipt, picker, auth, and verification screens.
- `src/ui`: native fields, currency entry, date selector, feedback, and motion primitives.
- `src/state/entry.tsx`: owner-scoped composer state and encrypted draft lifecycle.
- `src/services`: transport/session persistence, secure storage, and restricted QA fixture.
- `__tests__`: native component tests; `tests`: dependency-free service/fault tests.
- `.maestro`: native runtime acceptance; `.eas/workflows`: optional cloud builds and simulator tests.
