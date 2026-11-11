# Spndrr native — M1

Expo SDK 58 parity rebuild of `apps/mobile`. M0 established routing, secure token
storage, placeholder tabs, and the three API files lifted from PR #36. M1 adds
auth parity; the finance tabs remain placeholders.

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to a device-reachable
API origin without `/api`. The Android emulator example is `https://10.0.2.2:7085`;
a physical device needs your development host's reachable address. HTTPS requires
a certificate trusted by the device. Public Expo environment variables are bundled
into the app: never put secrets in them.

From the repository root:

```sh
pnpm install
pnpm --filter native lint
pnpm --filter native typecheck
pnpm --filter native test
pnpm --filter native android
pnpm --filter native start
```

For a generated Android debug build (Android SDK/JDK required):

```sh
cd apps/native
npx expo prebuild --platform android
cd android
./gradlew assembleDebug
```

`pnpm --filter native prebuild` also generates Android. Install the debug APK on
your emulator/device and run the dev-client Metro server with `start`.

Continuous Native Generation (CNG): `android/` and `ios/` are generated from
`app.config.ts`, ignored by Git, and must not be committed. No EAS project or
credentials are configured. Expo handles the monorepo with pnpm's default
isolated linker; no custom Metro configuration is needed.

`createFinanceClient()` validates configuration, uses the native fetch transport,
and serializes secure access-token persistence as session state changes. Await
login/signup/refresh/logout to include persistence. Refresh tokens arrive as an
HttpOnly cookie in the platform cookie store; the refresh storage helpers remain
as the M0 API surface only. JS never reads the API refresh token. All transport
requests retain `credentials: "include"`. End-to-end platform cookie behavior is
not asserted by mocked unit tests.


## M1 — Auth parity

Login, request access, invitation entry, and gated signup preserve the Capacitor
copy, field order, and API request bodies. Registration fails closed to request
access. Signup uses policy version `2026-07-26-ai-planning.1`. The small shared
StyleSheet theme copies the web CSS colors without adding UI dependencies.
Native has no HTML constraint validation: required fields, email syntax, and
required consent have minimal client messages; password length remains validated
by the API, matching the web form (which has no `minLength`). Server errors join
with spaces, and connection failures use the same web message.

The privacy policy opens in a full-screen modal while the form stays mounted.
Android Back and the 48×48 close button dismiss it. Safe area padding and wrapping
text support larger font scales without fixed text-container heights. Policy
links and the consent checkbox are separate touch targets.

`src/auth/session.tsx` provides one client and a `useSyncExternalStore` session
subscription. Startup calls `restore()` using the refresh cookie; authenticated
sessions enter Assistant, and signed-out startup shows the home gate with Login
and registration actions. Sign-out and failed refresh route to login, matching
the web workspace controller. Protected tabs leave
on signed-out/unavailable state. A 401 refreshes once and retries once; concurrent
401s share refresh. Settings shows the session name/email and signs out through
`POST /api/auth/logout`, clearing secure storage even when the server fails.
Access tokens continue to persist in secure-store.

Set `EXPO_PUBLIC_WEB_APP_URL` (default `https://mvp.spndrr.com`) for approved-link
origin validation, and `EXPO_PUBLIC_SUPPORT_EMAIL` (default
`support@spndrr.example`) for policy/support links. Neither is secret. The app
package remains `com.spndrr.app.dev` and the scheme remains `spndrr`.

Pasting an approved HTTPS or scheme invitation with `#token=...` converts it to
Expo Router's signup token parameter. Direct `spndrr://signup?token=...` uses that
parameter too. Full HTTPS app links and direct incoming fragment-token handling
remain M4 work.

Run the three native checks above. Jest covers transport/secure storage, startup
refresh, successful and failed refresh, single retry, concurrent 401s, logout,
auth request bodies, joined errors, registration fail-closed behavior, and link
parsing. No dependencies were added. Manual device verification still needed:

- Sign in, restart, and confirm the platform refresh cookie restores the session.
- Expire/revoke the session, trigger a protected request, and confirm login routing.
- Open the privacy sheet over filled signup/request forms; close with Android
  Back and the close button, verifying retained values and unchanged consent.
- At Android fontScale 1.3, scroll the entire policy and check the app bar/close
  target; test keyboard scrolling and invitation entry on both platforms.
