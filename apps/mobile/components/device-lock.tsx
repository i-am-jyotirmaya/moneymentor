"use client";

import { App } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { AndroidBiometryStrength, BiometricAuth, BiometryErrorType } from "@aparajita/capacitor-biometric-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, logout, refreshSession } from "../../web/lib/api";
import { configureSessionRefreshGuard, getAuthSessionSnapshot, subscribeToAuthSession } from "../../web/lib/auth-session";

import { deviceUnlockPreferenceKey, hasDeviceUnlock, readDeviceUnlockPreference,
  type DeviceCredentialStatus, type DeviceUnlockPreference } from "../../shared/device-unlock";

type Mode = "checking" | "open" | "locked" | "consent";
const deviceCredential = registerPlugin<{ authenticate(): Promise<{ status: DeviceCredentialStatus }> }>("SpndrrDeviceCredential");
const sessionMarker = "spndrr.native-session";
const primaryButton = "min-h-12 w-full rounded-lg bg-[var(--ink)] px-4 font-bold text-white disabled:opacity-60";
const secondaryButton = "min-h-12 w-full rounded-lg border border-[var(--border)] px-4 font-semibold disabled:opacity-60";

export function DeviceLock({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const policy = useRef({ unlocked: false, saved: false, probing: false, background: false, revision: 0 });
  const flight = useRef(false);
  const preference = useRef<DeviceUnlockPreference | null>(null);
  const [offerBiometrics, setOfferBiometrics] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!Capacitor.isNativePlatform()) {
      const timer = window.setTimeout(() => setMode("open"), 0);
      return () => window.clearTimeout(timer);
    }
    const state = policy.current;
    const marker = window.localStorage.getItem(sessionMarker);
    preference.current = readDeviceUnlockPreference(window.localStorage.getItem(deviceUnlockPreferenceKey));
    state.saved = marker === "saved" && hasDeviceUnlock(preference.current);
    if (!state.saved) window.localStorage.setItem(sessionMarker, "signed-out");
    const restoreDefault = configureSessionRefreshGuard(() => (state.unlocked && state.saved) || state.probing);
    const unsubscribe = subscribeToAuthSession(() => {
      state.saved = !!getAuthSessionSnapshot();
      window.localStorage.setItem(sessionMarker, state.saved && hasDeviceUnlock(preference.current) ? "saved" : "signed-out");
      if (!state.saved) {
        state.unlocked = true;
        setMode("open");
      } else if (preference.current === null) {
        state.unlocked = false;
        setMode("consent");
      } else if (state.background && hasDeviceUnlock(preference.current)) {
        state.unlocked = false;
        setMode("locked");
      }
    });
    const onPause = () => {
      if (state.background) return;
      state.revision++;
      state.background = true;
      setActive(false);
      if (!flight.current) setError("");
      if (state.saved && hasDeviceUnlock(preference.current)) {
        state.unlocked = false;
        setMode("locked");
      }
    };
    const onResume = () => {
      state.background = false;
      setActive(true);
    };
    const listeners = [App.addListener("pause", onPause), App.addListener("resume", onResume)];
    // Capacitor forwards UIScene events to the document on iOS.
    document.addEventListener("pause", onPause);
    document.addEventListener("resume", onResume);
    queueMicrotask(() => {
      if (!mounted) return;
      state.unlocked = !state.saved;
      setMode(state.saved ? "locked" : "open");
    });
    return () => {
      mounted = false;
      restoreDefault();
      unsubscribe();
      document.removeEventListener("pause", onPause);
      document.removeEventListener("resume", onResume);
      listeners.forEach(listener => void listener.then(handle => handle.remove()).catch(() => undefined));
    };
  }, []);

  const unlock = useCallback(async () => {
    const method = preference.current;
    if (flight.current || !hasDeviceUnlock(method)) return;
    const state = policy.current;
    flight.current = true; setBusy(true); setError("");
    let restoring = false;
    try {
      const startingRevision = state.revision;
      if (!await waitForActiveApp()) {
        if (!state.background) setError("Device unlock is unavailable. Try again or sign out.");
        return;
      }
      if (state.background || startingRevision !== state.revision) return;
      const status = method === "screen-lock" ? (await deviceCredential.authenticate()).status : await authenticateWithBiometrics();
      if (status !== "success") {
        if (status === "unavailable") setError("Set up a screen lock in device settings, or sign out to use your account credentials.");
        else if (status === "cancelled") setError("Device unlock canceled.");
        else if (!state.background) setError("Device unlock failed. Try again.");
        return;
      }
      const revision = state.revision;
      // A system PIN or biometric prompt can resolve before its app becomes active.
      if (!await waitForActiveApp() || revision !== state.revision) return;
      state.unlocked = true;
      if (!getAuthSessionSnapshot()) {
        restoring = true;
        state.probing = true;
        try { await refreshSession(); } finally { state.probing = false; }
      }
      if (revision === state.revision) setMode("open");
      else state.unlocked = false;
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 401)) {
        state.unlocked = false;
        setError(restoring ? "Could not restore your session. Check your connection and try again."
          : "Device unlock is unavailable. Try again or sign out.");
      }
    } finally { flight.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    if (mode !== "locked" || !active || busy || error) return;
    let canceled = false;
    queueMicrotask(() => { if (!canceled) void unlock(); });
    return () => { canceled = true; };
  }, [mode, active, busy, error, unlock]);

  function savePreference(choice: DeviceUnlockPreference) {
    try {
      window.localStorage.setItem(deviceUnlockPreferenceKey, choice);
      window.localStorage.setItem(sessionMarker, hasDeviceUnlock(choice) ? "saved" : "signed-out");
      preference.current = choice;
      const locked = hasDeviceUnlock(choice) && policy.current.background;
      policy.current.unlocked = !locked;
      setMode(locked ? "locked" : "open");
    } catch {
      setError("Could not save your app lock preference. Try again.");
    }
  }

  async function signOut() {
    if (flight.current) return;
    flight.current = true; setBusy(true);
    policy.current.unlocked = false;
    try { await logout(); } catch { /* The local session is cleared offline as well. */ }
    finally { router.replace("/login/"); setMode("open"); setBusy(false); flight.current = false; }
  }

  if (mode === "open") return children;
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] p-6 text-[var(--ink)]">
    {mode === "checking" && <p role="status" className="sr-only">Loading Spndrr…</p>}
    {mode === "consent" && <section className="w-full max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{offerBiometrics ? "Use Face ID or fingerprint?" : "Secure Spndrr with your screen lock?"}</h1>
      <p>{offerBiometrics
        ? "Allow biometrics to unlock Spndrr. You can still use your device PIN, pattern, or passcode."
        : "Use your device PIN, pattern, or passcode to protect your saved session. Without app lock, you’ll sign in again after restarting Spndrr."}</p>
      {error && <p role="alert">{error}</p>}
      {offerBiometrics ? <>
        <button type="button" className={primaryButton} onClick={() => savePreference("biometrics")}>Use biometrics</button>
        <button type="button" className={secondaryButton} onClick={() => savePreference("screen-lock")}>Use screen lock only</button>
      </> : <>
        <button type="button" className={primaryButton} onClick={() => { setError(""); setOfferBiometrics(true); }}>Use screen lock</button>
        <button type="button" className={secondaryButton} onClick={() => savePreference("off")}>Continue without app lock</button>
      </>}
    </section>}
    {mode === "locked" && error && <section className="w-full max-w-md space-y-4">
      <p role="alert">{error}</p>
      <button type="button" disabled={busy} onClick={() => setError("")}
        className={primaryButton}>Try again</button>
      <button type="button" disabled={busy} onClick={() => void signOut()}
        className={secondaryButton}>Sign out</button>
    </section>}
  </main>;
}

async function authenticateWithBiometrics(): Promise<DeviceCredentialStatus> {
  try {
    await BiometricAuth.authenticate({
      reason: "Unlock Spndrr",
      androidTitle: "Unlock Spndrr",
      allowDeviceCredential: true,
      androidBiometryStrength: AndroidBiometryStrength.strong,
    });
    return "success";
  } catch (error) {
    const code = (error as { code?: BiometryErrorType })?.code;
    if (code === BiometryErrorType.userCancel) return "cancelled";
    if (code === BiometryErrorType.passcodeNotSet) return "unavailable";
    return "failed";
  }
}

async function waitForActiveApp() {
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await App.getState()).isActive) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}
