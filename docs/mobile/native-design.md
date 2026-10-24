# Spndrr native visual and interaction design

The native workspace follows the web product's identity and assistant-first capture. It adapts the presentation for touch and native navigation. Web/backend code and financial contracts are unchanged by this revision.

## Product behavior

| Area | Native behavior |
| --- | --- |
| New transactions | Assistant text and reviewed dictation only; sending may save immediately |
| Structured fields | Saved-record editing only, PATCHing the original ID with exact category/account IDs |
| Special events | View existing account movements/refunds/reversals in history and details; no manual creation routes |
| Earlier uncertain manual saves | Preserve the encrypted marker, block new writes, offer history review and explicit clearing; never retry automatically |
| Navigation | Assistant, Dashboard, Planning, Judgments and More; More exposes transactions, accounts, categories, households and settings |
| Appearance | Light, Dark or System (default), stored as a device preference independently of account/household data |

## Visual foundations

`src/ui/theme.tsx` owns both palettes. Light colors match `apps/web/app/globals.css`: background `#f4f7f6`, ink `#102b26`, accent `#0e8878`, mint tint `#e3f4ef`. Dark uses deep green backgrounds, raised green surfaces, mint accents and contrasting text. Hero foregrounds and button foregrounds have separate tokens; surface color must not be used as foreground text on dark heroes.

`useStyles()` derives shared styles from context, so changing the theme updates mounted screens and memoized transaction rows without keying/remounting navigation, resetting drafts or clearing caches. Native navigation headers, tabs, status bar, keyboard, date selectors, modals, charts, errors and privacy screens use the selected appearance.

Cards and rows use soft shadows without decorative hard borders. Input outlines remain for legibility, with an accent focus ring. Components use 16–24 point corner radii, compact type hierarchy and generous spacing. Hero/primary actions use React Native's native `experimental_backgroundImage` gradients, with solid background colors as fallback. Gradients are static; no expensive continuous decoration is scheduled.

`Icon.tsx` supplies scalable stroke icons through SDK-compatible `react-native-svg`, including the web's existing Spndrr brand mark. Navigation uses consistent icons and clear text labels. Buttons retain Reanimated press feedback with system reduced-motion behavior. Dashboard totals remain server-authoritative; the two-column arrangement is presentation only. Existing virtualized history/pagination is retained.

The assistant shows bounded on-device conversation bubbles alongside a text/voice composer. It preserves clarification, explicit send, unknown-write reconciliation and acknowledged receipts. No image-upload or server-history contract is invented.

## Checking the change

From `apps/mobile-native`:

```sh
npm ci
npm run typecheck
npm run typecheck:core
npm run typecheck:services
npm run lint
npm test
npm run test:core
npm run test:services
npm run check:boundaries
npm run check:dependencies
npm run export:android
npm run export:ios
```

The local component coverage includes assistant-only creation, saved-record editing without duplication, recovery of earlier uncertain manual saves, appearance persistence, delayed-load/write ordering, system appearance changes and preservation of typed text. Shared financial/session/storage fault tests remain in place.

`.maestro/appearance.yml` exercises both themes, takes Home/Assistant/Dashboard/Settings screenshots, checks unsent text across theme changes and verifies appearance/draft restoration after restart. It is wired into native Android and iOS CI. Existing Maestro capture flows now use the assistant and retain editing/category/account selection coverage.

Local TypeScript, lint, all tests and Metro exports pass. Local Expo dependency validation used its bundled SDK compatibility table in offline mode after its online check timed out. The first hosted check identified newer Expo/sharing patch recommendations; Expo 57.0.31 and expo-sharing 57.0.24 are now pinned. Native screenshot scenarios, actual device frame pacing, large text, screen-reader traversal, keyboard/back gestures and sunlight/dark-room legibility require fresh runtime acceptance. There is no local Android/iOS runtime, and the attempted browser preview could not be rendered because its browser binary download failed; no visual or physical-device acceptance is claimed.

A native development-client rebuild is required for the new SVG/system-UI modules: `npm ci`, then `npm run android`, or rebuild/install the iOS development client. Production deployment and OTA publication are outside this change.
