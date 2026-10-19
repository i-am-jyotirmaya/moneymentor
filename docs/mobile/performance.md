# Native validation and performance record

Implementation baseline: 2026-10-19, branch `feat/native-mobile-migration`, starting at main `6e89646f`. This report separates executed checks from proposed acceptance targets.

## Executed checks

| Check | Evidence/result |
| --- | --- |
| Universal finance/session tests | 17 passing Node tests |
| Native storage/cookie-policy/QA service fault tests | 8 passing Node tests |
| Shared package strict TypeScript | Passed with TypeScript 5.9.3 |
| Native service strict TypeScript | Passed for storage, fixture transport, and shared sources |
| Native TS/TSX syntax transpilation | Passed; does not resolve native dependency types |
| Presentation dependency boundaries | Passed: native sources do not import web/Next/DOM/Capacitor; universal modules import no platform runtime |
| Full native dependency installation | Blocked: HTTPS request to registry.npmjs.org timed out |
| Native component tests | Eight implemented; not executed because native/Jest dependencies are unavailable |
| Expo dependency/Doctor checks and Metro exports | Not executed |
| Android compilation/runtime | Not executed; no native dependencies/SDK/device available in this task environment |
| iOS compilation/runtime | Not executed; no linked EAS project/credentials or iPhone/cloud runtime |
| Frame timing, startup, CPU, memory | NOT MEASURED |

Node service tests use an in-memory mock of encrypted storage and a deterministic contract fixture. They test chunk commits, interrupted writes, user isolation, retry behavior and state transitions; they do not prove Keychain/Keystore encryption, native cookie handling, network integration, or smooth animations. No FPS, startup, or memory target has been achieved by evidence yet.

## Proposed budgets (pending a representative-device baseline)

| Scenario | Initial proposed budget | Measurement |
| --- | --- | --- |
| Composer first visible response | <100 ms from tap, excluding OS keyboard animation | Input timestamp to first presented frame |
| Normal interaction/scrolling | Sustained 60 Hz; p95 frame interval ≤16.7 ms, minimal long frames | Release-build Perfetto/FrameTimeline and native frame metrics |
| High-refresh interactions | 120 Hz where device/system supports it; 8.3 ms frame interval goal | Physical high-refresh device, no inference from emulator |
| Warm first interactive UI | <1 s excluding server session latency | Process/display timestamps + native readiness marker |
| Cold first interactive UI | <2.5 s excluding server session latency | At least 20 cold starts per device/build |
| 10,000-record history | Virtualized scrolling, no unbounded row mounting | Frame metrics plus heap/RSS over repeated pagination |
| Repeated composer/selector cycles | No retained-screen or listener growth | 50 cycles + memory snapshots after settling |
| Slow API request | Input/scroll/back remain responsive; no duplicate writes | Inject 10-second response delay and dropped response after commit |

These budgets must be revised after measurements on a named midrange Android phone and a named supported iPhone. Record OS, refresh rate, display scale, CPU/RAM, release/profile build mode, commit, dataset size, network profile, repetitions, median/p95, and traces. Development-mode timing is diagnostic, not acceptance evidence.

## Reproducible scenarios

1. Cold/warm launch, login, force close, reopen, expired access token, refresh rotation, revoked session, and signout. Test real cookies on both platforms; the QA fixture does not exercise them.
2. Open the composer 30 times, edit an amount, repeatedly open/dismiss the keyboard, choose child categories and similarly named accounts, and dismiss with iOS back gestures/Android back. Preserve draft content without hidden controls.
3. Submit manual expense and income; simulate 400, 401, 403, 429, timeout, 5xx, process interruption, malformed success, and lost response after commit. Replaying a frozen reference must leave one record. Verify on the actual backend.
4. Send natural-language expense/income, clarification, and special financial-event text. Verify assistant messages are never treated as a parse preview or automatically resent after unknown outcomes. Inspect account, event kind, category, amount, date, and visibility in persisted records.
5. Edit the saved amount/account/category/date and confirm history updates. Test a lost PATCH response and reload before correction. Verify native back/discard behavior.
6. Load many pages, search loaded data, rapidly navigate, background/foreground, and switch accounts. Confirm no previous user's cached financial data or draft appears after signout/signin.
7. Test 200% text scale, TalkBack/VoiceOver, reduced motion, small phone, tablet, portrait/landscape, safe areas, gesture navigation, hardware keyboard, and denied/unavailable secure storage.
8. Later milestones add voice/image permission, upload, cancellation, and large-attachment scenarios only after those APIs exist and the first-slice gate is passed.

For Android release QA builds, start with `adb shell am start -W PACKAGE/.MainActivity`, `adb shell dumpsys gfxinfo PACKAGE reset`, replay the scenario, then collect `adb shell dumpsys gfxinfo PACKAGE framestats` and a Perfetto trace. `am start -W` is an activity timing, not by itself the usable-finance-screen time. Do not put credentials, transaction descriptions, or account identifiers into traces/logs.

Use physical iPhone/TestFlight for real API, keyboard and session behavior. Quantitative iOS release profiling requires an actual iOS profiling environment, such as a hosted Mac with Instruments or a profiling partner; owning a Mac is not required. Cloud simulator UI execution and screen recording do not establish physical-device FPS or memory stability.

## Gate before bulk migration

- Resolve and commit the native lockfile; run Expo dependency/Doctor checks, full type checks, lint, component tests, both Metro exports, and Android compilation.
- Execute the native Maestro flow on Android and iOS; attach artifacts rather than marking compilation as runtime acceptance.
- Validate real HTTPS login/refresh/force-close/signout and transaction writes on physical devices.
- Resolve keyboard, gesture, storage, accessibility and financial correctness issues; collect named-device motion/startup/memory results.
- Only then start dashboard/planning/household/voice/image parity migration. Keep Capacitor until the replacement meets feature and release criteria.
