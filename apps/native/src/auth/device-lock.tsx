import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, BackHandler, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandTile, Button, ErrorBox } from "../ui/AuthForm";
import { Skeleton } from "../ui/Skeleton";
import { Text, useTheme } from "../ui";
import { useSession } from "./session";
import { getAccessToken } from "./token-storage";

type LockState = "checking" | "open" | "locked";
const DeviceLockContext = createContext<LockState>("checking");
export const useDeviceLock = () => useContext(DeviceLockContext);

export function DeviceLockProvider({ children }: { children: ReactNode }) {
  const { client } = useSession();
  const { color } = useTheme();
  const [state, setState] = useState<LockState>("checking");
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
      if (next !== "background") return;
      backgroundRevision.current++;
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

  async function unlock() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const proof = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Spndrr",
        biometricsSecurityLevel: Platform.OS === "android" && Number(Platform.Version) < 30 ? "weak" : "strong",
      });
      if (!proof.success) {
        if (proof.error === "not_enrolled" || proof.error === "passcode_not_set") {
          setError("Set up a screen lock in device settings, or sign out to use your account credentials.");
        } else if (!["user_cancel", "system_cancel", "app_cancel"].includes(proof.error)) {
          setError("Unlock failed. Try again with biometrics or your screen lock.");
        }
        return;
      }
      if (AppState.currentState === "background") return;
      const revision = backgroundRevision.current;
      client.setDeviceLocked(false);
      if (!client.getSnapshot().session) await client.restore();
      if (revision === backgroundRevision.current) setState("open");
      else client.setDeviceLocked(true);
    } catch {
      if (client.getSnapshot().status === "signedOut") setState("open");
      else {
        client.setDeviceLocked(true);
        setError("Could not restore your session. Check your connection and try again.");
      }
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
    {covered && <SafeAreaView style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <View style={{ gap: 16, width: "100%", maxWidth: 440 }}>
          <BrandTile />
          {state === "checking" ? <Skeleton label="Loading session" /> : <>
            <Text variant="headline" accessibilityRole="header">Spndrr is locked</Text>
            <Text tone="text2">Unlock with your biometrics or device screen lock.</Text>
            <ErrorBox message={error} />
            <Button title="Unlock Spndrr" testID="unlock-spndrr" disabled={busy} onPress={() => void unlock()} />
            <Button title="Sign out" variant="outline" disabled={busy} onPress={() => void signOut()} />
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>}
  </DeviceLockContext.Provider>;
}
