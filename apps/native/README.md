# Spndrr native — Expo workspace

Expo SDK 58 parity rebuild of `apps/mobile`, with auth, the finance workspace,
Android platform polish, and local development builds for Android and iOS.

Assistant voice input uses the platform speech recognizer (Android SpeechRecognizer or iOS Speech). Tap the microphone with an empty composer, grant permission, speak, and stop or wait for recognition to finish. Review the transcript and tap Send; the existing assistant endpoint receives text with `inputMode: Voice`. Spndrr does not upload raw audio, but the OS speech provider may process speech remotely. Cancel discards the recording. A fresh native development build is required after installing this feature.

If the microphone reports “Install the latest native build,” rebuild and reinstall
Spndrr on the device. Reloading Metro only updates JavaScript. Use
`pnpm --filter native run:ios simulator <simulator-UDID>` for the simulator or
`DEVELOPMENT_TEAM=<team-id> bash apps/native/scripts/install-iphone.sh <iPhone-UDID>`
for a standalone iPhone build. Both commands refresh Expo’s native configuration
and link the speech module.
On iOS, voice input starts with Indian English and retries with UK English if
the Indian English recognizer is unavailable or fails to initialize.

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

## Local build and install

From the repository root, with dependencies installed and the API configured as above:

```sh
# Android SDK, JDK 21, adb, and an x86_64 AVD
pnpm --filter native run:android emulator
# Use an explicit serial when multiple devices are connected
pnpm --filter native run:android device <adb-serial>
# macOS only, with Xcode, its command line tools and CocoaPods
pnpm --filter native run:ios simulator <simulator-UDID>
DEVELOPMENT_TEAM=<team-id> pnpm --filter native run:ios device <device-id>
```

The `run:*` commands build, install and launch. Use `build:*` with only the target
to build without a device, or `install:*` to install and launch the previously
built artifact. Artifacts live under the ignored `apps/native/dist/local/` tree.
Start Metro separately with `pnpm --filter native start` for the development client.

- Android uses `assembleDebug --max-workers=2` with `x86_64` for the emulator
  and `arm64-v8a` for physical devices. On an Apple Silicon host, use
  `SPNDRR_EMULATOR_ARCH=arm64-v8a` with a matching AVD. Set `ANDROID_HOME` or
  `ANDROID_SDK_ROOT`; choose `ANDROID_SERIAL` (or the final argument) for a
  specific attached device. A single available AVD can boot automatically;
  set `SPNDRR_AVD` to choose one. For USB/Wi-Fi devices, enable debugging and
  authorize or pair/connect with adb first.
- iOS uses locally generated native projects and Xcode. Choose a simulator by
  UDID with `xcrun simctl list devices available`. `run:ios simulator` generates
  the Debug simulator Keychain entitlements with the `LOCALDEV01` prefix during
  prebuild and signs the build ad hoc. The simulator command needs no Apple
  development team or manual Xcode project edits.
- Choose a connected iOS device with `xcrun devicectl list devices`. Set
  `DEVELOPMENT_TEAM` for physical-device signing. Optionally set
  `PROVISIONING_PROFILE_SPECIFIER` and `CODE_SIGN_IDENTITY`.
  Automatic provisioning updates are opt-in with `SPNDRR_IOS_ALLOW_PROVISIONING_UPDATES=1`.
  Signing identities and profiles must already be available locally; never put
  credentials, signing secrets or real test accounts into this repository.

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


### Troubleshoot iOS simulator sign-in

On the iPhone 16 simulator, Spndrr Dev showed “Could not connect to Spndrr” even
after the local API returned `Healthy`. The simulator log showed Keychain error
`-34018`: the installed build had neither an `application-identifier` nor a
`keychain-access-groups` entitlement. Spndrr clears its stored tokens before
sending a login request, so the failure happened before the API received the
request. [Apple's Keychain troubleshooting guide](https://developer.apple.com/forums/thread/114456)

To check for this failure, reproduce it once and inspect the simulator log.
Use the UDID from `xcrun simctl list devices booted`.

```sh
xcrun simctl spawn <simulator-UDID> log show --last 5m --style compact \
  --predicate 'process == "securityd" AND eventMessage CONTAINS[c] "SpndrrDev"'
```

#### Rebuild with simulator signing

The repository's `run:ios simulator` build disables signing. Manually signing
the finished bundle caused a launch failure. Building with Xcode's simulator
signing pipeline generated the entitlements the simulator needed.

1. In the generated `apps/native/ios/SpndrrDev` directory, copy
   `SpndrrDev.entitlements` to `SpndrrDevSimulator.entitlements`. Preserve the
   existing keys and add an `application-identifier` string and a
   `keychain-access-groups` array with the same app-specific value. This build
   used `LOCALDEV01.com.spndrr.app.dev` for both.
2. In the generated `SpndrrDev.xcodeproj/project.pbxproj`, add the following
   build setting next to the existing `CODE_SIGN_ENTITLEMENTS` setting for the
   app target's Debug configuration. The SDK qualifier scopes it to simulator
   builds.

   ```text
   "CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]" = SpndrrDev/SpndrrDevSimulator.entitlements;
   ```

3. With the generated iOS workspace and Pods in place, build from the repository
   root. Then install the signed artifact using the existing install command.

   ```sh
   xcodebuild -workspace apps/native/ios/SpndrrDev.xcworkspace -scheme SpndrrDev \
     -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
     -derivedDataPath "$PWD/apps/native/dist/local/ios/simulator/derived-data" \
     CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES build

   pnpm --filter native install:ios simulator <simulator-UDID>
   ```

#### Set up and verify the API

- **Local API.** Start Homebrew PostgreSQL with `brew services start postgresql@15`
  and provision the development database and role in the [backend setup](../api/README.md).
  The migration failed until `pgvector` was installed for PostgreSQL 15. Build
  the extension from source with Homebrew's PostgreSQL 15 `pg_config`, then run
  `CREATE EXTENSION IF NOT EXISTS vector;` in the local `moneymentor` database as
  a PostgreSQL administrator. Run the Operations `migrate` command afterward.
  DBeaver connected to `moneymentor` on `localhost:5432`.
  [pgvector build instructions](https://github.com/pgvector/pgvector#linux-and-mac)
- **VS Code.** Install the .NET 10 SDK and Microsoft's C# Dev Kit. In this setup,
  macOS rejected the Homebrew .NET host inside the Dev Kit process because of a
  code-signing mismatch. Pointing the VS Code user setting
  `dotnetAcquisitionExtension.sharedExistingDotnetPath` at Microsoft's signed
  `dotnet` executable fixed solution discovery. The local
  **Spndrr API (local HTTP)** launch configuration builds `MoneyMentor.Api`
  and uses its `http` profile. If the debugger reports a missing runtime with
  Homebrew .NET, set `DOTNET_ROOT` in the launch environment to the SDK's
  `libexec` directory. Confirm readiness at `http://localhost:5267/health/ready`.
- **Simulator verification.** Set `EXPO_PUBLIC_API_BASE_URL=http://localhost:5267`
  in `apps/native/.env`. Start Metro with
  `pnpm --filter native start --localhost` and relaunch Spndrr Dev after changing
  the origin. A disposable sign-in reached the local API and received the
  expected credentials rejection because the fresh database had no users.
  After switching the origin to `https://api.spndrr.com` and relaunching, a
  single simulator sign-in returned HTTP 200 and the authenticated workspace
  requests succeeded.

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
subscription. Startup presents the system unlock prompt automatically for a saved session and
refreshes through the HttpOnly cookie after unlock. Signed-out startup shows the home
gate with Login and registration actions. Sign-out and failed refresh route to login, matching
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
parameter too. M4 also handles incoming HTTPS app links and raw fragment tokens.

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

## Passkeys and device unlock

On the first password sign-in on a supported device, Spndrr offers to set up a
passkey if the account has none. Confirm your password to create one, or choose
**Later** and set it up in **Settings → Passkeys**. After enrollment, choose
**Sign in with a passkey** on the login screen to open the system credential picker.
After sign-in, choose whether to protect the saved session with your device’s
screen lock. If you enable app lock, Spndrr asks separately before enabling
Face ID or fingerprint unlock. Both choices are saved on the device.
Screen lock alone uses your device PIN, pattern, or passcode. Declining app lock
keeps you signed in for the current run and requires account sign-in after a
restart. Existing installations without a saved choice sign in once to set up
app lock. After a canceled or failed unlock, try again or sign out.

See [Mobile passkey setup](../../docs/mobile-passkeys.md) for domain associations,
API configuration, and physical-device verification.

## Native E2E smoke (Maestro, local only)

Prerequisites: install the pinned Maestro CLI **2.12.1** with the
[free OSS installer](https://docs.maestro.dev/getting-started/installing-maestro):

```sh
export MAESTRO_VERSION=2.12.1; curl -Ls "https://get.maestro.mobile.dev" | bash
```

Have Android SDK `adb`
available, run `emulator-5554`, and install the debug dev build
(`com.spndrr.app.dev`) first. The runner does not build or start an emulator.

From the repository root:

```sh
pnpm --filter native e2e:android
```

Without credentials, this command runs only `.maestro/smoke.yaml`. With both
credential variables supplied, it also runs `.maestro/signin.yaml`: sign in,
visit every workspace tab, then sign out through Settings and verify the login
screen. Supply a throwaway local account through the environment only:

```sh
MAESTRO_TEST_EMAIL="$THROWAWAY_EMAIL" MAESTRO_TEST_PASSWORD="$THROWAWAY_PASSWORD" pnpm --filter native e2e:android
```

The runner also accepts `SPNDRR_E2E_EMAIL` / `SPNDRR_E2E_PASSWORD` when neither
`MAESTRO_TEST_EMAIL` nor `MAESTRO_TEST_PASSWORD` is supplied. Never commit
credentials, put them in `apps/native/.env`, or use shared/vault test accounts.
A local-only signup helper at `/workspace/spndrr/tools/local-signup` can create
a throwaway account when the local API is running; see that directory's README.
The helper is outside this repository. The sign-in flow requires a reachable API
and an account ready to enter the workspace (including required privacy consent).

The runner checks the installed CLI against **2.12.1** and fails on a mismatch
or failed version check. `MAESTRO_ALLOW_VERSION_MISMATCH=1` opts into a warning
and continues. `MAESTRO_VERSION` is needed only for installation, not normal runs.

The runner reuses Metro on port 8081 or starts it non-interactively and stops only
its own Metro on exit. The flow clears app state and checks the signed-out home
and Login button; no API or sign-in is needed. This is separate from Jest and has
no CI integration.
When starting its own Metro with no `EXPO_PUBLIC_API_BASE_URL` environment variable and no `apps/native/.env`, the runner exports the non-secret defaults from `.env.example` (including `EXPO_PUBLIC_API_BASE_URL=https://10.0.2.2:7085`) without creating or modifying `.env`.

Artifacts stay in `apps/native/e2e-artifacts/<UTC timestamp>/`, including the home
screenshot, Maestro console output (`maestro.log`), Metro logs when started, and a device
screenshot plus logcat on Maestro failure. Set `ANDROID_SERIAL` to override the
device (default `emulator-5554`) or `FLOW_DIR` to select an explicit flow file or
directory instead of the automatic selection; extra command arguments pass
through to `maestro test`. Selecting `signin.yaml` or a directory containing it
requires both credential variables and fails before device access if missing.
Each invocation uses one artifact directory, including when both flows run.

The sign-in flow labels the credential-input steps to keep their values out of
Maestro step titles. The runner captures console output in the log and omits
`--debug-output`. On exit after a pass, failure, or interrupt, it redacts the
sign-in password from files in the run directory and the run's Maestro test
directories under `~/.maestro/tests` (or `$MAESTRO_HOME_DIR/tests`). Use a
throwaway account and discard its credentials after the run.


## M4 — Platform polish

- Android back closes existing native overlays first, pops navigation history, then returns a non-root workspace tab to Assistant. Cold-linked auth screens return home. Assistant and signed-out home retain default exit behaviour.
- Router's `+native-intent` hook parses raw cold/warm OS links before fragments are lost. Only known routes and the configured HTTPS origin are rewritten; credentials, unknown paths, and other schemes (including the Expo dev-client launch URL) are left unchanged. Incoming signup links accept fragment or query tokens; pasted invitations still require fragments. Prefer fragment invitations so tokens stay out of server logs.
- App Links and iOS associated domains use `EXPO_PUBLIC_WEB_APP_URL` (default `https://mvp.spndrr.com`). Android filters match only `/signup` or `/signup/`; other web paths remain in the browser. Changing the origin requires a native rebuild. Production verification still needs the host's `/.well-known/assetlinks.json` with the actual package/signing certificate and Apple `apple-app-site-association` with the actual team/bundle identifiers and exact `/signup` and `/signup/` paths. Ops follow-up: host these files on the web domain before Android App Links and iOS universal links can verify. These hosted files are not supplied here.
- Existing alert/retry UI remains; signup verification, report loading and editor account loading now offer retries. Auth and mutation forms retain their submit actions for retry; no connectivity polling dependency was added.
- System font scaling stays enabled. Text containers use wrapping/minimum heights; actions can shrink within wrapping rows. The local CNG plugin preserves MainActivity config changes and adds `fontScale` to avoid activity recreation when font size changes.
- Android uses window resize; auth/composer retain keyboard avoidance and scrollable forms use automatic iOS keyboard insets. Editor Save now scrolls with its fields. Existing form ScrollViews retain handled keyboard taps.
- Slice icon uses a safe-inset adaptive foreground and a monochrome mask derived from the approved Slice mark. SDK 58 `expo-splash-screen` configures the launch screen, using the mark for Android 12+ and stacked artwork for iOS, on `#F3F5F9`. Router manages splash hiding when navigation is ready; no explicit hold is added.
- Light mode is forced through Expo config, `expo-system-ui`, and Android MainActivity via `AppCompatDelegate.MODE_NIGHT_NO`; the brand accent is `#0B7A4E`.

## M5 — Mobile-first workspace

The shell uses a 28dp decorative Slice mark, a left-aligned title, and the household
switcher. Assistant, Transactions and Dashboard are direct tabs; More opens a sheet
with Reports, Planning, Household, Settings and Sign out. The active tab is a filled
pill. Visited tab screens retain their state and use a fade transition. The tab bar
hides when the IME is visible, and form fields scroll without hiding behind the keyboard.

Assistant confirms persisted transactions, Planning announces successful goal creation,
and Dashboard shows the selected month's stored income and spending in an accessible
cash-flow chart (a daily series remains deferred). Pending reads use skeletons.

Validation: run `pnpm --filter native lint`, `pnpm --filter native typecheck`, and `pnpm --filter native test` from the repository root. Device follow-up: verify signed app links on both platforms, cold/warm invitations, overlay/back ordering, keyboard visibility in forms/modals, fontScale 1.3, dark-system light appearance, launcher masks and splash screenshots. Rebuild with CNG before device/Maestro checks; generated native trees stay uncommitted.
