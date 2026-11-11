# Spndrr native — M0

Expo SDK 58 parity rebuild scaffold of `apps/mobile`. M0 contains placeholder
login and Assistant, Dashboard, Transactions and Settings tabs, secure token
storage, and the three API files lifted from PR #36. No screen parity or real
login UI is implemented. The login screen has an explicitly labelled preview
link to inspect the tabs. The initial route reads secure storage to select login
or Assistant; token presence is only a routing hint, not server authorization.

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
HttpOnly cookie; the refresh storage helpers are an M0 API surface only. Native
cookie/session restoration and refresh wiring, real login, and protected tab
navigation belong to M1. The lifted client's existing refresh request is retained,
but end-to-end cookie behavior is not asserted by these mocked unit tests.
