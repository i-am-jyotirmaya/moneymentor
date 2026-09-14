# Spndrr mobile

Android and iOS apps with the same UI and API flows as `apps/web`. Capacitor packages a **local Next.js static export** into native projects; it does not load the deployed website, require a Next.js server on the phone, or replace the web deployment.

## Run from Windows (Android)

1. Install Node 24, the repository's pnpm version, Android Studio with SDK 36, and JDK 21. Set `ANDROID_HOME` and `JAVA_HOME` for your installation.
2. From the repository root, run `pnpm install --frozen-lockfile`.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`. Set `NEXT_PUBLIC_API_BASE_URL` to the **device-reachable HTTPS API origin**, without `/api`. If the API is reverse-proxied under the MVP hostname, use that hostname. The example domain is a placeholder. Never put AWS credentials, API keys or other secrets in `NEXT_PUBLIC_*` values.
4. Run `pnpm mobile:android`. This builds the bundled screens, synchronizes plugins/assets and opens Android Studio. Select an emulator or USB device and press Run.

For browser development: `pnpm dev:mobile` opens port 3001; `pnpm dev:web` continues to open the existing web app on port 3000. A local HTTP API is permitted in browser development; configure its CORS allowlist for `http://localhost:3001`. Native builds deliberately require HTTPS and disable Android cleartext traffic. Use a trusted HTTPS development endpoint to test a phone.

After every UI, environment or plugin change, rebuild and sync before running a native project. `pnpm --filter mobile sync` builds and syncs both platforms; `pnpm build:mobile` followed by `pnpm --filter mobile exec cap sync android` targets Android only. Environment values are compiled into the binary, so changing server environment variables cannot update an installed app.

## iOS

On a Mac with Xcode 26+, CocoaPods and Node 24: install dependencies, set the mobile `.env.local`, then run `pnpm mobile:ios`. Select your Apple development team in Xcode to run on an iPhone; the simulator can build without a distribution signing identity. CocoaPods is used because the speech recognition plugin does not provide a Swift package.

The checked-in app identifiers are `com.spndrr.app`. Native project files, permissions, URL scheme and brand assets are tracked; generated web bundles, native caches, signing files and installed Pods are ignored. Store submission, signing certificates, app listings and verified HTTPS app links require your developer-account/domain configuration.

## Shared UI and mobile capabilities

| Area | Implementation |
| --- | --- |
| Screens | Route files re-export the current web pages: assistant, transactions, dashboard/menu, planning/goals, households, settings, privacy, login and signup. Access requests also offer an invitation-link input. |
| Styling | Imports the web Tailwind stylesheet and scans the shared components. Only safe-area and device viewport adjustments are mobile-specific. |
| API/auth | Uses the same API client, in-memory access token and single-flight refresh. CapacitorHttp sends native requests and handles server cookies; no token or refresh cookie is saved to localStorage/Preferences. The browser web app retains its original fetch behavior. |
| Signup restrictions | Inherits `feat/restrict-signup`: registration mode, access requests, approved invitation validation, locked invitation email, privacy acceptance, failure states and no public signup in RequestOnly mode. Deploy that branch's backend/migration before testing against a real API. |
| Invitations | `spndrr://signup#token=...` opens the app. Existing HTTPS email links can be pasted under Request MVP access → Already approved. Only the configured web origin and known app routes are accepted; the server still validates every invitation. |
| Voice | The existing microphone button invokes native speech recognition and asks for microphone/speech permission when used. Recognition availability/language depends on the device; denied permission keeps typed input available. The system recognizer may use its provider's cloud service. |
| Export | The existing data export action opens the native share sheet with a JSON file in private cache. A later export replaces it; the OS may evict cache files. |
| Navigation | Android back closes the editor/menu or blurs a field before going back; at the root it minimizes the app. Insets keep the UI clear of the notch/home indicator, and the native keyboard resizes the viewport. |
| Offline | Bundled screens can open without downloading the website; financial reads/writes still require the API. An offline banner is shown. There is no offline mutation queue. |

`apps/web/lib/platform.ts` provides browser defaults and an adapter registration point. Only the mobile root registers native adapters, so the web bundle has no Capacitor dependency. New web routes should get a one-line mobile re-export; a route-parity test catches omissions. Server-only Next.js features require an explicit mobile alternative because this target uses static export.

## Validate

```sh
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm build:mobile
pnpm --filter mobile exec playwright install chromium
pnpm --filter mobile test:e2e
pnpm --filter web lint
pnpm --filter web build
pnpm test:web:e2e
```

The mobile Playwright suite serves `out/` with a static server and runs the same mobile UI regressions as the web app, plus invitation, narrow-viewport and offline checks. API responses are mocked; this does not validate the native bridge. `mobile.yml` additionally compiles Android and unsigned iOS simulator apps.

Before distributing a build, test on an Android device and iPhone with the real HTTPS API: login → force close → reopen/refresh → expired access token → logout → reopen; request access and approved/expired/reused invitations; microphone accept/deny/stop; keyboard/notch layouts; export to Files; household permissions; account deletion. Confirm signout revokes the server session and the app remains signed out after relaunch. Native cookie/permission behavior cannot be proven by browser emulation.

The iOS privacy manifest declares the Filesystem required-reason API. Review App Store data-collection disclosures against the deployed backend and speech provider before submission.

References: [Capacitor native HTTP](https://capacitorjs.com/docs/apis/http), [environment setup](https://capacitorjs.com/docs/getting-started/environment-setup), [Next.js static export](https://nextjs.org/docs/app/guides/static-exports).
