import { useNavigation, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { getPasskeyCredential, supportsPasskeys } from "../../src/auth/passkeys";
import { useSession } from "../../src/auth/session";
import { AuthFrame } from "../../src/ui/AuthFrame";
import { AuthLink, ErrorBox, LoginFooter } from "../../src/ui/AuthForm";
import { AuthMethodTiles } from "../../src/ui/AuthMethodTiles";
import { PrivacyPolicySheet } from "../../src/ui/PrivacyPolicySheet";
import { Text } from "../../src/ui/Text";

export default function Login() {
  const router = useRouter();
  const navigation = useNavigation();
  const { client, setPasskeyOfferAccountId } = useSession();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState(false);
  const passkeyAvailable = supportsPasskeys();

  function showEmail() {
    if (pending.current) return;
    setError("");
    router.navigate("/(auth)/login-email");
  }

  async function signInWithPasskey() {
    if (pending.current || !passkeyAvailable) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const session = await client.loginWithPasskey(options => getPasskeyCredential("get", options));
      if (session) {
        setPasskeyOfferAccountId(null);
        if (navigation.isFocused()) router.replace("/(tabs)/assistant");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in with a passkey.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Welcome" titleAccent="back." expandedHero testID="login-screen">
      <Text variant="headline" accessibilityRole="header">Sign in with</Text>
      <View style={styles.methods}>
        <AuthMethodTiles passkeyAvailable={passkeyAvailable} busy={busy}
          onEmail={showEmail} onPasskey={() => { void signInWithPasskey(); }} />
      </View>
      {!!error && <View style={styles.fallback}>
        <ErrorBox message={error} />
        <AuthLink title="Use email instead" onPress={showEmail} />
      </View>}
      <LoginFooter onPrivacy={() => setPolicy(true)} />
      <PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} />
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  methods: { marginTop: 6 },
  fallback: { gap: 5, alignItems: "flex-start" },
});
