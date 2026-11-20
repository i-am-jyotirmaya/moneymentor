"use client";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { AndroidBiometryStrength, BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, logout, refreshSession } from "../../web/lib/api";
import { configureSessionRefreshGuard, getAuthSessionSnapshot, subscribeToAuthSession } from "../../web/lib/auth-session";

type Mode = "checking" | "open" | "locked";
const sessionMarker = "spndrr.native-session";

export function DeviceLock({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const policy = useRef({ unlocked: false, saved: false, probing: false, background: false, revision: 0 });
  const flight = useRef(false);

  useEffect(() => {
    let mounted = true;
    if (!Capacitor.isNativePlatform()) {
      const timer = window.setTimeout(() => setMode("open"), 0);
      return () => window.clearTimeout(timer);
    }
    const state = policy.current;
    const marker = window.localStorage.getItem(sessionMarker);
    state.saved = marker === "saved";
    const restoreDefault = configureSessionRefreshGuard(() => (state.unlocked && state.saved) || state.probing);
    const unsubscribe = subscribeToAuthSession(() => {
      state.saved = !!getAuthSessionSnapshot();
      if (state.background && state.saved) {
        state.unlocked = false;
        setMode("locked");
      }
      window.localStorage.setItem(sessionMarker, state.saved ? "saved" : "signed-out");
      if (!state.saved) {
        state.unlocked = true;
        setMode("open");
      }
    });
    const onPause = () => {
      if (state.background) return;
      state.revision++;
      state.background = true;
      if (state.saved) {
        state.unlocked = false;
        setMode("locked");
      }
    };
    const onResume = () => { state.background = false; };
    const listeners = [App.addListener("pause", onPause), App.addListener("resume", onResume)];
    // Capacitor forwards UIScene events to the document on iOS.
    document.addEventListener("pause", onPause);
    document.addEventListener("resume", onResume);
    async function initialize() {
      if (marker === "signed-out") {
        state.unlocked = true;
        if (mounted) setMode("open");
        return;
      }
      if (marker === "saved") {
        if (mounted) setMode("locked");
        return;
      }
      // Check older installs for a cookie before opening any workspace route.
      state.probing = true;
      try { await refreshSession(); }
      catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) return;
      }
      finally { state.probing = false; }
      if (mounted) setMode("locked");
    }
    void initialize();
    return () => {
      mounted = false;
      restoreDefault();
      unsubscribe();
      document.removeEventListener("pause", onPause);
      document.removeEventListener("resume", onResume);
      listeners.forEach(listener => void listener.then(handle => handle.remove()).catch(() => undefined));
    };
  }, []);

  async function unlock() {
    if (flight.current) return;
    const state = policy.current;
    flight.current = true; setBusy(true); setError("");
    try {
      const security = await BiometricAuth.checkBiometry();
      if (!security.deviceIsSecure) {
        setError("Set up a screen lock in device settings, or sign out to use your account credentials.");
        return;
      }
      try {
        await BiometricAuth.authenticate({
          reason: "Unlock Spndrr",
          androidTitle: "Unlock Spndrr",
          allowDeviceCredential: true,
          androidBiometryStrength: AndroidBiometryStrength.strong,
        });
      } catch {
        // A dismissed or failed system prompt keeps the lock screen available for retry.
        return;
      }
      const revision = state.revision;
      if (!(await App.getState()).isActive || revision !== state.revision) return;
      state.unlocked = true;
      if (!getAuthSessionSnapshot()) {
        state.probing = true;
        try { await refreshSession(); } finally { state.probing = false; }
      }
      if (revision === state.revision) setMode("open");
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.status === 401)) {
        state.unlocked = false;
        setError("Could not restore your session. Check your connection and try again.");
      }
    } finally { flight.current = false; setBusy(false); }
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
    <section className="w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-white p-6">
      <h1 className="text-2xl font-bold">{mode === "checking" ? "Loading Spndrr…" : "Spndrr is locked"}</h1>
      {mode === "locked" && <>
        <p>Unlock with your biometrics or device screen lock.</p>
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void unlock()}
          className="min-h-12 w-full rounded-lg bg-[var(--ink)] px-4 font-bold text-white disabled:opacity-60">Unlock Spndrr</button>
        <button type="button" disabled={busy} onClick={() => void signOut()}
          className="min-h-12 w-full rounded-lg border border-[var(--border)] px-4 font-semibold disabled:opacity-60">Sign out</button>
      </>}
    </section>
  </main>;
}
