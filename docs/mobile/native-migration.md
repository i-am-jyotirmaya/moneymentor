# Spndrr native mobile migration

Status: milestones 1–2 code implemented; native acceptance pending. This branch owns `apps/mobile-native`, the new universal `packages/finance-core`, and mobile documentation/workflows. `apps/web`, backend code, existing API contracts, and existing workflows are out of scope. The Capacitor app remains supported until native runtime acceptance passes.

## Decision and dependency baseline

Use React Native with Expo development builds and a native presentation layer. Flutter offers native rendering and strong animation tooling, but requires rewriting the existing TypeScript domain/API logic in Dart. Both support Android, iOS, Windows development, and hosted macOS compilation; neither permits running Apple's local iOS simulator on Windows. React Native best fits this TypeScript repository. Reanimated runs motion on the UI thread; native stacks provide platform back gestures. Frame rate remains a measurement, not a framework guarantee.

The baseline was verified on 2026-10-19 against the [Expo SDK 57 release branch](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json): Expo 57.0.30, React Native 0.86.3, React 19.2.3, Reanimated 4.5.1, Worklets 0.10.1, Gesture Handler ~2.32.0, Screens ~4.26.0, Safe Area ~5.7.0. Use this SDK's recommendations rather than installing the latest independent native packages. Run `npx expo install --check` and Expo Doctor after dependency changes.

React Navigation native-stack, accessible native controls, Expo SecureStore, and an injected universal API transport form the first slice. Do not add Skia until profiling demonstrates a need. Development builds include custom native modules; Expo Go is not the acceptance environment.

The first hosted dependency check confirmed the SDK's development-tool recommendations: native TypeScript 6.0.3 and React types 19.2.4. The universal package retains its existing-compatible TypeScript 5.9.3 development checker. The native cookie adapter uses the maintained New Architecture TurboModule `@preeternal/react-native-cookie-manager` 7.0.0, following the deprecated upstream package's migration guidance. Its Foundation store is used for iOS networking; no WebKit screen is introduced.

| Decision factor | React Native + Expo | Flutter |
| --- | --- | --- |
| Motion and native behavior | Native screens/gestures plus UI-thread Reanimated; must profile actual devices | Flutter rendering/animation pipeline; must also profile actual devices |
| Android/iOS and Windows development | Android locally; iOS builds on hosted macOS/EAS and tests on cloud simulator/iPhone | Android locally; iOS still needs hosted macOS compilation and an iOS runtime |
| Existing TypeScript investment | Reuses universal DTOs, validation, and API orchestration | Requires Dart counterparts or an additional cross-language boundary |
| Maintenance and ecosystem | Fits current React/TypeScript skills; SDK coordinates native dependency versions | Mature mobile ecosystem, but another language/toolchain for this team |
| Profiling/debugging | React Native DevTools plus native profilers for release acceptance | Flutter DevTools plus native platform profiling |
| Build/maintenance cost | Existing language reuse; cloud quotas/signing still apply | New Dart implementation effort; cloud quotas/signing still apply |

## Repository audit at main 6e89646f

- `apps/mobile` is Next.js static export wrapped in Capacitor 8. Its routes re-export `apps/web` pages and its stylesheet imports the web presentation layer. This is unsuitable as the native UI foundation.
- Routes cover assistant, dashboard, transactions, planning, reports, household, settings, login, signup, request-access, and privacy.
- Capacitor plugins cover HTTP/cookies, keyboard, application links/back, filesystem/share, and community native speech recognition. Browser APIs, DOM components, Next routing, and Tailwind stay in the existing apps.
- `apps/web/lib/api.ts` currently mixes transport, auth, DTOs, and feature methods. There are no existing `packages/*` packages to reuse. Add an independent compatible package; do not extract or rewrite web code during concurrent development.
- Login returns an in-memory access token. Refresh rotation uses HttpOnly `mm_refresh` and `mm_session` cookies scoped to `/api/auth`; there is no refresh-token JSON field. Native refresh must preserve that contract.
- `POST /api/transactions` accepts `TransactionIntent`, including exact account/category IDs, event kind, date, and `externalReference`. Deduplication requires an account/observation account. `PATCH /api/transactions/{id}` edits existing records.
- `POST /api/assistant/messages` can immediately SAVE a transaction. It is not a parse/preview endpoint. A UI must explicitly say it sends and tracks, and must not subsequently create the same transaction manually.
- Categories include parent IDs, type, classification, and hidden flags. Accounts distinguish `BankAccount`, `CreditCard`, `Cash`, and `Wallet`; names such as Kotak and Kotak upi must never be collapsed by the client.
- Main currently exposes text/voice assistant messages; its message contract has no multipart/image field or upload endpoint. Image/OCR work exists separately and is not invented here.
- Existing mobile tests are static/browser tests; mobile CI is manual. They cannot prove native permission, cookie, keyboard, or frame-time behavior.

## Boundaries and installation

`packages/finance-core` owns platform-neutral DTOs, decimal input validation, category paths, immutable submission state, session coordination, and the API client. It has no runtime dependencies and imports no React, DOM, Node, or native modules. Native code owns transport, native cookies, encrypted persistence, UI, navigation, and haptics. Existing web exports remain unchanged.

`apps/mobile-native` is an isolated npm project with a local `file:../../packages/finance-core` dependency. Keeping its React/native dependencies and lock separate avoids changing the existing pnpm React resolution used by the web and Capacitor app. Run native commands from that directory, not via existing `mobile:*` commands. The shared package remains discoverable by the existing `packages/*` workspace pattern. Cloud build archives must include the repository root so the local dependency is available.

The native app is intentionally absent from the root pnpm workspace globs. Expo's package-manager resolver only adopts a parent workspace when the app matches that workspace's package globs; otherwise it uses the app's own lockfile. This boundary must remain explicit when adding future workspace paths. The only root changes are `.gitignore` exceptions for the universal package and a lock importer referencing the already-resolved TypeScript version; no existing dependency resolution changes.

## First vertical slice and safety

1. Restore the native session, sign in, and load the category/account/settings resources.
2. Open the native transaction composer. Keep text input and structured entry distinct because the assistant writes immediately.
3. Manual entry validates decimal precision, date, category hierarchy, currency, and an active exact account ID. A stable external reference plus a frozen payload permits retrying the same manual operation without another financial write. Server data remains authoritative.
4. Assistant messages support clarification. Network failures or malformed success can leave the outcome unknown: do not automatically retry. Ask the user to check history before explicitly starting another message.
5. Preserve encrypted user-scoped drafts across navigation and interruption. Do not mark a transaction saved before a valid server record arrives. Do not queue background financial writes.
6. Access tokens stay in memory. Persist refresh cookies and drafts only through native secure storage; clear user data on signout. Share no cache or draft between accounts. Do not log finance text or authentication material.

Backend reference deduplication is not a generic idempotency API. It is scoped to an account and compares only specific financial fields. A pending manual request must retain its original payload; corrections use a new operation only after its outcome is known. Assistant writes have no equivalent idempotency contract.

## Feature-parity matrix

| Feature | Existing Capacitor implementation | Native replacement / milestone |
| --- | --- | --- |
| Login/refresh/logout | Web forms, Capacitor HTTP cookie jar | Native forms, cookie adapter + encrypted persistence; first slice |
| Natural-language tracking | Shared web assistant, write-on-message API | Native text composer with clarification and unknown-outcome guard; first slice |
| Manual expense/income | Existing API and transaction editor | Native structured form, account/category IDs, retry reference; first slice |
| Category/subcategory selection | DOM searchable dropdown | Native searchable hierarchical picker; first slice |
| Account selection | DOM dropdown and account panel | Native picker retaining account type and ID; first slice |
| Transaction editing | Web transaction panel | Edit the saved transaction through PATCH; first slice |
| Recent history | Web transaction list/pagination | Native virtualized verification list; first slice |
| Privacy consent | Web consent gate | Native consent gate using current policy/API; first slice |
| Dashboard/insights/reports | Re-exported web screens | Milestone 3; retain Capacitor meanwhile |
| Budgets/commitments/goals | Web planning forms and asynchronous plans | Milestone 3; no new budget endpoint invented |
| Transfers/card payments/refunds | Account-aware backend semantics | Milestone 3 after slice validation; never model as generic income/expense |
| Account/category management | Web settings | Basic account creation needed for first entry; broader management milestone 3 |
| Household/privacy/settings/export | Web screens/native share adapter | Milestone 3/4 |
| Signup/access/invitations | Shared web request-only flow and links | Native signup/request-only access, privacy and invitation deep links implemented; actual email delivery/links still need device acceptance |
| Voice | Capacitor native system recognizer | Reviewed system dictation implemented; permission/cancellation component coverage added, native service acceptance pending |
| Multiple screenshots/OCR | Separate unmerged input pipeline work | Milestone 4 once actual API contract is available |
| Offline | Bundled UI, online API only | Encrypted unsent drafts; no background write queue |

## Validation gate and rollout

Transaction entry has passed hosted Android and iOS functional acceptance. Android large-history acceptance and both x86_64/ARM64 QA builds also pass. Software-emulator frame measurements missed the proposed budget; representative physical-device profiling remains a release acceptance item while the remaining native screens are implemented. Preserve the working Capacitor application until feature and release acceptance. See [performance.md](performance.md) and [windows-development.md](windows-development.md) for evidence and build instructions.

Milestone 1: audit, decision, shared boundaries, native bootstrap and build configuration.
Milestone 2: transaction entry, native design/motion foundations, automated tests, device acceptance.
Milestones 3–5 are in progress: financial screens; supported native inputs; performance and distribution sign-off. Each feature's incomplete status must stay visible in the PR. Image processing still requires an actual backend contract. Do not claim the entire migration or release acceptance until the corresponding checks pass.

## Sources

- [Expo SDK reference](https://docs.expo.dev/versions/latest/)
- [Expo SDK 57 exact package versions](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json)
- [EAS monorepo builds](https://docs.expo.dev/build-reference/build-with-monorepos/)
- [EAS iOS simulator builds](https://docs.expo.dev/build-reference/simulators/)
- [EAS Maestro cloud tests](https://docs.expo.dev/eas/workflows/examples/e2e-tests/)
