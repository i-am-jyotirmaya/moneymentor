import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorBox } from "../ui/AuthForm";
import { Skeleton } from "../ui/Skeleton";
import { useTheme } from "../ui";
import { useSession } from "./session";
import { getAccessToken } from "./token-storage";

type LockState = "checking" | "open" | "locked";
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
  const backgroundRevision = useRef(0);
  const native = Platform.OS !== "web";

  useEffect(() => {
    let mounted = true;
    if (!native) {
      void client.restore().catch(() => undefined).finally(() => { if (mounted) setState("open"); });
      return () => { mounted = false; };
    }
    client.setDeviceLocked(true);
    void getAccessToken().then(token => {
      if (!mounted) return;
      if (token) setState("locked");
      else {
        client.setDeviceLocked(false);
        setState("open");
      }
    }).catch(() => {
      if (mounted) setState("locked");
    });
    const appState = AppState.addEventListener("change", next => {
      setActive(next === "active");
      if (next !== "background") return;
      backgroundRevision.current++;
      if (!flight.current) setError("");
      if (client.getSnapshot().session) {
        client.setDeviceLocked(true);
        setState("locked");
      }
    });
    const session = client.subscribe(() => {
      if (AppState.currentState === "background" && client.getSnapshot().session) {
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
    if (state !== "locked") return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => back.remove();
  }, [state]);

  const unlock = useCallback(async () => {
    if (flight.current || !isAppActive()) return;
    flight.current = true;
    setBusy(true);
    setError("");
    let restoring = false;
    try {
      const proof = await LocalAuthentication.authenticateAsync({
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
          setError("Unlock failed. Try again with biometrics or your screen lock.");
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
    {covered && <SafeAreaView style={[StyleSheet.absoluteFill, { backgroundColor: color.bg, justifyContent: "center", alignItems: "center", padding: 24 }]}>
      {state === "checking" && <Skeleton label="Loading session" />}
      {state === "locked" && !!error && <View style={{ gap: 16, width: "100%", maxWidth: 440 }}>
        <ErrorBox message={error} />
        <Button title="Try again" disabled={busy} onPress={() => setError("")} />
        <Button title="Sign out" variant="outline" disabled={busy} onPress={() => void signOut()} />
      </View>}
    </SafeAreaView>}
  </DeviceLockContext.Provider>;
}
