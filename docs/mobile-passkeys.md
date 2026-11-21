# Spndrr mobile passkeys

The Expo app (`apps/native`) offers passkey setup after the first password
sign-in for an account without a passkey on a supported device. Confirm your
password to enroll, or choose **Later** and enroll from **Settings → Passkeys**.
After enrollment, choose **Sign in with a passkey** on the login screen. The
password remains available for recovery and account management.

After account sign-in, both apps ask whether to protect the saved session with
the device’s PIN, pattern, or passcode. A second choice enables Face ID or
fingerprint unlock. After opt-in, the system prompt opens automatically on
relaunch or return from the background. Declining app lock requires account
sign-in after relaunch. App-switcher previews hide the workspace. Android
versions below API 33 use the secure window flag, which also blocks screenshots.

## Configure the relying party

1. Use a stable HTTPS hostname for the relying party. The default is
   `mvp.spndrr.com`. If you change it, set `Passkeys__RelyingPartyId` on the API
   and `EXPO_PUBLIC_PASSKEY_RP_ID` for Expo prebuild. Use the same hostname in
   both settings, without a scheme or path. Apply the auth migration through
   the existing Operations `migrate` command before serving the updated API.
2. On the relying-party host, serve `/.well-known/assetlinks.json` over HTTPS
   without a redirect. Give the signed Expo Android app the
   `delegate_permission/common.get_login_creds` relation. Include its package
   name (`com.spndrr.app.dev`) and the SHA-256 fingerprint of the signing
   certificate. On Google Play use the **app signing** certificate. Include only the builds that should be trusted
   by that environment.
3. For each Android signing certificate, add
   `android:apk-key-hash:<base64url SHA-256 of the DER certificate, without padding>`
   to the API's `Passkeys__AndroidOrigins` comma-separated list. Indexed
   configuration keys such as `Passkeys__AndroidOrigins__0` also work. Docker
   Compose exposes `PASSKEY_RP_ID` and `PASSKEY_ANDROID_ORIGINS`. The certificate
   association and the API allowlist must both match the certificate installed
   on the device. Use a separate relying party and test API for debug signing.
4. Enable the Associated Domains capability for the signed Expo iOS app and serve
   `/.well-known/apple-app-site-association` on the relying-party host without
   a redirect. Include the signed application ID, for example
   `{"webcredentials":{"apps":["TEAMID.com.spndrr.app.dev"]}}`.
   Merge `webcredentials` into any existing association document to preserve
   app links. Expo prebuild adds the `webcredentials` entitlement.
5. Rebuild and sign the Expo apps after configuring the domain. Serve the
   association files with `Content-Type: application/json` and keep the API
   reachable at a device-trusted HTTPS URL.

## Verify on signed devices

- In the Expo app on Android and iOS, sign in with a new test account and set
  up a passkey from the first-login offer. Sign out, then use the login screen’s
  passkey button. Cancel the picker and check that the password form is still
  available. With another account, choose **Later**, sign in again and check
  that the offer stays dismissed. Add and remove a passkey from Settings.
- On a fresh install, sign in and enable screen lock. On a device with
  biometrics enrolled, decline biometrics and confirm that reopening Spndrr
  asks only for the device PIN, pattern, or passcode. Repeat on a fresh
  install with biometric consent, and verify biometrics and the credential
  fallback. Background the app, check the app-switcher preview, then reopen
  it and confirm the system prompt opens automatically. Cancel it and confirm
  the workspace stays hidden.
- Force-close and reopen the app. Confirm unlock restores the same account.
  Repeat with the API temporarily unreachable, then reconnect and retry.
  Revoke the server session and confirm the next refresh returns to sign-in.
  Sign out, relaunch, and confirm the device shows the signed-out screen.
