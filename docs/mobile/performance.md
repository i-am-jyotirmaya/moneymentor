# Native validation and performance record

Implementation baseline: 2026-10-19, branch `feat/native-mobile-migration`, starting at main `6e89646f`. This report separates executed checks from proposed acceptance targets.

## Executed checks

| Check | Evidence/result |
| --- | --- |
| Universal finance/session tests | 18 passing Node tests |
| Native storage/cookie-policy/QA service fault tests | 8 passing Node tests |
| Shared package strict TypeScript | Passed with TypeScript 5.9.3 |
| Native service strict TypeScript | Passed for storage, fixture transport, and shared sources |
| Native TS/TSX syntax transpilation | Passed; does not resolve native dependency types |
| Presentation dependency boundaries | Passed: native sources do not import web/Next/DOM/Capacitor; universal modules import no platform runtime |
| Hosted domain/service job | Passed on initial GitHub run 39203850380 |
| Hosted native dependency installation | Succeeded on initial GitHub run; development-tool version corrections and maintained cookie adapter applied afterward |
| Full native dependency installation | Hosted install succeeded and the resolved lockfile is committed; local registry access remains unavailable |
| Native component tests | 11/11 passed in GitHub run 39246337227, including request-only signup and uncertain access-request recovery; dictation coverage added afterward |
| Expo dependency compatibility | Passed in GitHub run 39204313055 after SDK tooling corrections |
| Full native TypeScript | Passed, including shared/service checks, in GitHub run 39204973766 |
| Native lint | Passed with zero warnings in GitHub run 39235443009 |
| Expo Doctor | 21/21 checks passed in GitHub run 39235443009; the private platform-independent finance package is excluded from native-module catalog lookup |
| Metro exports | Android and iOS succeeded in GitHub run 39237312769 |
| Exported JS advisory-module review | No braces/node-forge/sprintf-js/uuid module paths in 1,355 Android and 1,351 iOS source-map entries in run 39237312769; does not audit native binaries or build-host exposure |
| Android compilation/runtime | Release QA APK and full native transaction acceptance passed in run 39246337227: login, category and exact card choice, manual save/edit, assistant clarification, unknown-write reconciliation and logout. Screenshots retained and composer/receipt inspected |
| iOS compilation | Release simulator build passed in run 39239041550; simulator app artifact uploaded |
| iOS runtime | Login passed in run 39239041550, then draft restoration exposed missing Keychain entitlements. Post-build signing in run 39242838641 failed launch verification. Run 39245986909 successfully compiles with Xcode embedding simulator entitlements; runtime acceptance is in progress. Device signing is unchanged |
| Initial Android emulator diagnostics | Run 39242838641: API 35 x86_64, Pixel 6 profile, 1080×2400/420 dpi, software GPU, Release QA. Activity cold TotalTime 765 ms; failed-login sample 120 frames, p95 125 ms, 80% janky frames; PSS 89,540 KB, RSS 218,952 KB. These are incomplete-flow diagnostics, not a passing transaction benchmark or physical-device performance |
| Full transaction emulator diagnostics | Run 39246337227, same profile/software rendering: cold Activity TotalTime 871 ms; 761 frames, p95 85 ms, 66.89% janky frames; PSS 112,810 KB, RSS 248,232 KB. Functional flow passed; the frame budget did not. Emulator logged invalid ColorBuffer/texture errors, and CI now selects the supported software renderer rather than deprecated swiftshader_indirect. No physical-device FPS inference |

Node service tests use an in-memory mock of encrypted storage and a deterministic contract fixture. They test chunk commits, interrupted writes, user isolation, retry behavior and state transitions; they do not prove Keychain/Keystore encryption, native cookie handling, network integration, or smooth animations. No FPS, startup, or memory target has been achieved by evidence yet.

The separate real-API job in run 39244003534 passed against the unchanged .NET application and a fresh PostgreSQL database over validated local HTTPS. It exercised secure cookie attributes/rotation, session restoration, card/account identity, transaction replay/edit, dashboard totals, trash/restore, category management, goals/contributions, commitments and settings. Its Node HTTP/cookie adapter does not replace native cookie acceptance. Android run 39242838641 exposed an IME layout/focus problem after keyboard permission provisioning; native forms now explicitly use Android keyboard height avoidance and the acceptance flow scrolls controls into view before tapping.

Real-API run 39245986909 additionally passed card settlement and linked-refund checks: a card payment leaves consumption unchanged, and a refund reduces it. The new native profiling scenario seeds 10,000 fixture records, scrolls paginated history, and repeats six composer/keyboard/category-sheet cycles. Results are pending. The fixture holds its simulated server data inside the app process, so its memory use is not comparable to a remote production backend. The local domain/service suite currently passes 43 tests.

## Dependency advisory record

The native lock/audit artifact from run 39235443009 records 39 production-graph advisories (27 high, 12 moderate, no critical). Underlying packages are [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), and [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq). Expo/React Native list build and test tools in their production dependency graph. The app uses Expo Crypto for transaction references. Source-map review in run 39237312769 found none of these four packages in either exported native JavaScript bundle. This narrows app-JavaScript exposure; it does not prove native-binary or build-host security. Release review must track upstream fixes and assess build-tool exposure; no unsupported major-version overrides or automatic audit fixes are applied. CI retains audit and bundle-review JSON and blocks critical advisories. These unresolved advisories remain a release-review item alongside device acceptance.

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

- The native lockfile, Expo compatibility/Doctor, type checks, lint, component tests, both Metro exports and both native compilers passed. Complete platform runtime acceptance.
- Execute the native Maestro flow on Android and iOS; attach artifacts rather than marking compilation as runtime acceptance.
- Validate real HTTPS login/refresh/force-close/signout and transaction writes on physical devices.
- Resolve keyboard, gesture, storage, accessibility and financial correctness issues; collect named-device motion/startup/memory results.
- Only then start dashboard/planning/household/voice/image parity migration. Keep Capacitor until the replacement meets feature and release criteria.
