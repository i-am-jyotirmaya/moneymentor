import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BackHandler, Keyboard, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AndroidKeyboardFrame } from "../ui/AndroidKeyboardFrame";
import { Button, ErrorBox, Field } from "../ui/AuthForm";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";
import { useTheme } from "../ui/ThemeProvider";
import { getPasskeyCredential, supportsPasskeys } from "./passkeys";
import { useSession } from "./session";

export function PasskeyEnrollmentOffer({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { client, session, passkeyOfferAccountId } = useSession();
  const { color } = useTheme();
  const accountId = session?.user.id;
  const key = accountId && accountId === passkeyOfferAccountId ? `spndrr.passkey-offer.${accountId}` : null;
  const [offer, setOffer] = useState<"unchecked" | "offer" | "skip">("unchecked");
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);

  useEffect(() => {
    if (!enabled || !key || offer !== "unchecked" || !supportsPasskeys()) return;
    let active = true;
    async function check(storageKey: string) {
      try {
        const seen = await SecureStore.getItemAsync(storageKey);
        if (!active) return;
        const eligible = !seen && (await client.listPasskeys()).length === 0;
        if (active) setOffer(eligible ? "offer" : "skip");
      } catch {
        // Eligibility is optional. A storage or network failure should never delay sign-in.
        if (active) setOffer("skip");
      }
    }
    void check(key);
    return () => { active = false; };
  }, [client, enabled, key, offer]);

  const visible = enabled && key !== null && offer === "offer";
  const finish = useCallback(() => {
    if (!key) return;
    Keyboard.dismiss();
    setPassword("");
    setOffer("skip");
    void SecureStore.setItemAsync(key, "seen").catch(() => undefined);
  }, [key]);

  useEffect(() => {
    if (!visible) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!flight.current) finish();
      return true;
    });
    return () => back.remove();
  }, [finish, visible]);

  async function enroll() {
    if (!visible || flight.current || !password) return;
    flight.current = true;
    Keyboard.dismiss();
    setPassword("");
    setBusy(true);
    setError("");
    try {
      if (await client.registerPasskey(password, options => getPasskeyCredential("create", options))) finish();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a passkey.");
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }

  return <View style={styles.fill}>
    <View style={styles.fill} pointerEvents={visible ? "none" : "auto"}
      accessibilityElementsHidden={visible} importantForAccessibility={visible ? "no-hide-descendants" : "auto"}>
      {children}
    </View>
    {visible && <SafeAreaView testID="passkey-enrollment-offer" style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]}>
      <AndroidKeyboardFrame>
        <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <Icon name={{ ios: "key.fill", android: "passkey" }} size={36} color="primaryText" />
            <Text variant="headline" accessibilityRole="header">Set up a passkey</Text>
            <Text tone="text2">Sign in with your device screen lock or biometrics next time. You can also set this up later in Settings.</Text>
            {confirming && <>
              <Text tone="text2">Confirm your password to create a passkey.</Text>
              <Field label="Current password" value={password} onChangeText={setPassword}
                secureTextEntry autoCapitalize="none" autoComplete="current-password" editable={!busy}
                returnKeyType="go" onSubmitEditing={() => void enroll()} />
            </>}
            <ErrorBox message={error} />
            {confirming ? <Button title="Create passkey" loading={busy} disabled={busy || !password} onPress={() => void enroll()} />
              : <Button title="Set up passkey" onPress={() => setConfirming(true)} />}
            <Button title="Later" testID="passkey-enrollment-later" variant="outline" disabled={busy} onPress={finish} />
          </View>
        </ScrollView>
      </AndroidKeyboardFrame>
    </SafeAreaView>}
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  content: { width: "100%", maxWidth: 440, alignSelf: "center", gap: 16 },
});
