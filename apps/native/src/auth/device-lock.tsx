import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorBox } from "../ui/AuthForm";
import { StartupSplash } from "../ui/StartupSplash";
import { Text, useTheme } from "../ui";
import { useSession } from "./session";
import { clearTokens, getAccessToken, getDeviceUnlockPreference, setDeviceUnlockPreference } from "./token-storage";
import { authenticateWithScreenLock } from "./device-credential";
import { hasDeviceUnlock, type DeviceUnlockPreference } from "../../../shared/device-unlock";

type LockState = "checking" | "open" | "locked" | "consent";
const DeviceLockContext = createContext<LockState>("checking");
export const useDeviceLock = () => useContext(DeviceLockContext);

const isAppActive = () => AppState.currentState === "active";

async function waitForDevicePromptToClose() {
  if (AppState.currentState !== "background") return true;
  return new Promise<boolean>(resolve => {
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") finish(true);
    });
    const timeout = setTimeout(() => finish(false), 1_000);
    function finish(active: boolean) {
      clearTimeout(timeout);
      subscription.remove();
      resolve(active);
    }
  });
}

export function DeviceLockProvider({ children }: { children: ReactNode }) {
  const { client } = useSession();
  const { color } = useTheme();
  const [state, setState] = useState<LockState>("checking");
  const [active, setActive] = useState(isAppActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);
  const preference = useRef<DeviceUnlockPreference | null>(null);
  const [offerBiometrics, setOfferBiometrics] = useState(false);
  const backgroundRevision = useRef(0);
  const native = Platform.OS !== "web";

  useEffect(() => {
    let mounted = true;
    if (!native) {
      void client.restore().catch(() => undefined).finally(() => { if (mounted) setState("open"); });
      return () => { mounted = false; };
    }
    client.setDeviceLocked(true);
    const initialize = async () => {
      const [token, savedPreference] = await Promise.all([
        getAccessToken().catch(() => null),
        getDeviceUnlockPreference().catch(() => null),
      ]);
      if (!mounted) return;
      preference.current = savedPreference;
      if (token && hasDeviceUnlock(savedPreference)) {
        setState("locked");
        return;
      }
      // Require account sign-in on this launch if app lock was declined or has no recorded consent.
      if (token) await clearTokens().catch(() => undefined);
      if (mounted) {
        client.setDeviceLocked(false);
        setState("open");
      }
    };
    void initialize();
    const appState = AppState.addEventListener("change", next => {
      setActive(next === "active");
      if (next !== "background") return;
      backgroundRevision.current++;
      if (!flight.current) setError("");
      if (hasDeviceUnlock(preference.current) && client.getSnapshot().session) {
        client.setDeviceLocked(true);
        setState("locked");
      }
    });
    const session = client.subscribe(() => {
      if (!client.getSnapshot().session) return;
      if (preference.current === null) {
        client.setDeviceLocked(true);
        setState("consent");
      } else if (hasDeviceUnlock(preference.current) && AppState.currentState === "background") {
        client.setDeviceLocked(true);
        setState("locked");
      }
    });
    if (Platform.OS === "ios") void ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => undefined);
    return () => {
      mounted = false;
      appState.remove();
      session();
    };
  }, [client, native]);

  useEffect(() => {
    if (state !== "locked" && state !== "consent") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, [state]);

  const unlock = useCallback(async () => {
    const method = preference.current;
    if (flight.current || !isAppActive() || !hasDeviceUnlock(method)) return;
    flight.current = true;
    setBusy(true);
    setError("");
    let restoring = false;
    try {
      const proof = method === "screen-lock" ? await authenticateWithScreenLock() : await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Spndrr",
        disableDeviceFallback: false,
        biometricsSecurityLevel: Platform.OS === "android" && Number(Platform.Version) < 30 ? "weak" : "strong",
      });
      if (!proof.success) {
        if (proof.error === "not_enrolled" || proof.error === "passcode_not_set") {
          setError("Set up a screen lock in device settings, or sign out to use your account credentials.");
        } else if (proof.error === "user_cancel") {
          setError("Device unlock canceled.");
        } else if (AppState.currentState !== "background") {
          setError("Device unlock failed. Try again.");
        }
        return;
      }
      // The PIN activity can return its result just before the app becomes active.
      const revision = backgroundRevision.current;
      if (!await waitForDevicePromptToClose() || revision !== backgroundRevision.current) return;
      client.setDeviceLocked(false);
      if (!client.getSnapshot().session) {
        restoring = true;
        await client.restore();
      }
      if (revision === backgroundRevision.current) setState("open");
      else client.setDeviceLocked(true);
    } catch {
      if (restoring && client.getSnapshot().status === "signedOut") {
        client.setDeviceLocked(false);
        setState("open");
      } else {
        client.setDeviceLocked(true);
        setError(restoring ? "Could not restore your session. Check your connection and try again."
          : "Device unlock is unavailable. Try again or sign out.");
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }, [client]);

  useEffect(() => {
    if (state !== "locked" || !active || busy || error) return;
    let canceled = false;
    queueMicrotask(() => { if (!canceled) void unlock(); });
    return () => { canceled = true; };
  }, [state, active, busy, error, unlock]);

  async function savePreference(choice: DeviceUnlockPreference) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await setDeviceUnlockPreference(choice);
      preference.current = choice;
      const locked = hasDeviceUnlock(choice) && AppState.currentState === "background";
      client.setDeviceLocked(locked);
      setState(locked ? "locked" : "open");
    } catch {
      setError("Could not save your app lock preference. Try again.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }

  async function signOut() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    try { await client.logout(); } catch { /* Local sign-out also runs when offline. */ }
    finally {
      client.setDeviceLocked(false);
      setState("open");
      setError("");
      setBusy(false);
      flight.current = false;
    }
  }

  const covered = state !== "open";
  return <DeviceLockContext.Provider value={state}>
    <View style={{ flex: 1 }} pointerEvents={covered ? "none" : "auto"}
      accessibilityElementsHidden={covered} importantForAccessibility={covered ? "no-hide-descendants" : "auto"}>
      {children}
    </View>
    {state === "checking" ? <StartupSplash /> : covered && <SafeAreaView style={[StyleSheet.absoluteFill, { backgroundColor: color.bg, justifyContent: "center", alignItems: "center", padding: 24 }]}>
      {state === "consent" && <View style={{ gap: 16, width: "100%", maxWidth: 440 }}>
        <Text variant="headline" accessibilityRole="header">{offerBiometrics ? "Use Face ID or fingerprint?" : "Secure Spndrr with your screen lock?"}</Text>
        <Text tone="text2">{offerBiometrics
          ? "Allow biometrics to unlock Spndrr. You can still use your device PIN, pattern, or passcode."
          : "Use your device PIN, pattern, or passcode to protect your saved session. Without app lock, you’ll sign in again after restarting Spndrr."}</Text>
        <ErrorBox message={error} />
        {offerBiometrics ? <>
          <Button title="Use biometrics" disabled={busy} onPress={() => void savePreference("biometrics")} />
          <Button title="Use screen lock only" variant="outline" disabled={busy} onPress={() => void savePreference("screen-lock")} />
        </> : <>
          <Button title="Use screen lock" disabled={busy} onPress={() => { setError(""); setOfferBiometrics(true); }} />
          <Button title="Continue without app lock" variant="outline" disabled={busy} onPress={() => void savePreference("off")} />
        </>}
      </View>}
      {state === "locked" && !!error && <View style={{ gap: 16, width: "100%", maxWidth: 440 }}>
        <ErrorBox message={error} />
        <Button title="Try again" disabled={busy} onPress={() => setError("")} />
        <Button title="Sign out" variant="outline" disabled={busy} onPress={() => void signOut()} />
      </View>}
    </SafeAreaView>}
  </DeviceLockContext.Provider>;
}
