# Spndrr mobile passkeys

Both the Expo app (`apps/native`) and Capacitor app (`apps/mobile`) use native
credential providers. Existing users sign in with their password and confirm it
in **Settings → Passkeys** to add or remove a passkey. After enrollment, they can
choose **Sign in with a passkey** without entering an email or password. The
password remains available for recovery and account management.

A saved session opens behind the device unlock screen after relaunch and after
backgrounding. Unlock accepts enrolled biometrics or the operating system's
PIN, pattern, or passcode. The server session still has its existing expiry and
revocation rules. App-switcher previews hide the workspace. Android versions
below API 33 use the secure window flag, which also blocks screenshots.

## Configure the relying party

1. Use a stable HTTPS hostname for the relying party. The default is
   `mvp.spndrr.com`. If you change it, set `Passkeys__RelyingPartyId` on the API,
   `EXPO_PUBLIC_PASSKEY_RP_ID` for Expo prebuild, and `NEXT_PUBLIC_PASSKEY_RP_ID`
   for Capacitor sync. Use the same hostname in all three, without a scheme or a
   path. Apply the auth migration through the existing Operations `migrate`
   command before serving the updated API.
2. On the relying-party host, serve `/.well-known/assetlinks.json` over HTTPS
   without a redirect. Give each signed Android app the
   `delegate_permission/common.get_login_creds` relation. Include its package
   name (`com.spndrr.app.dev` for Expo, `com.spndrr.app` for Capacitor) and the
   SHA-256 fingerprint of the signing certificate. On Google Play use the
   **app signing** certificate. Include only the builds that should be trusted
   by that environment.
3. For each Android signing certificate, add
   `android:apk-key-hash:<base64url SHA-256 of the DER certificate, without padding>`
   to the API's `Passkeys__AndroidOrigins` comma-separated list. Indexed
   configuration keys such as `Passkeys__AndroidOrigins__0` also work. Docker
   Compose exposes `PASSKEY_RP_ID` and `PASSKEY_ANDROID_ORIGINS`. The certificate
   association and the API allowlist must both match the certificate installed
   on the device. Use a separate relying party and test API for debug signing.
4. Enable the Associated Domains capability for each signed iOS app and serve
   `/.well-known/apple-app-site-association` on the relying-party host without
   a redirect. Include both signed application IDs as applicable, for example
   `{"webcredentials":{"apps":["TEAMID.com.spndrr.app.dev","TEAMID.com.spndrr.app"]}}`.
   Merge `webcredentials` into any existing association document to preserve
   app links. Expo prebuild and Capacitor sync add the `webcredentials` entitlement.
5. Rebuild and sign both native projects after configuring the domain. Serve the
   association files with `Content-Type: application/json` and keep the API
   reachable at a device-trusted HTTPS URL.

## Verify on signed devices

- On Android and iOS, sign in with a test account, add a passkey, sign out, and
  sign back in using the passkey picker. Cancel the picker and check that the
  password form remains available. Remove the passkey and confirm it can no
  longer sign in.
- With a session signed in, background the app, check the app-switcher preview,
  then reopen it. Cancel the prompt and confirm the workspace stays hidden.
  Verify biometrics and the device credential fallback, including a device
  configured with only a PIN or passcode.
- Force-close and reopen the app. Confirm unlock restores the same account.
  Repeat with the API temporarily unreachable, then reconnect and retry.
  Revoke the server session and confirm the next refresh returns to sign-in.
  Sign out, relaunch, and confirm the device shows the signed-out screen.
