import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../src/api/client";
import { registrationIsOpen } from "../../src/auth/registration";
import { useSession } from "../../src/auth/session";
import { AuthForm, Button, ErrorBox, type Invitation } from "../../src/ui/AuthForm";
import { styles } from "../../src/ui/theme";

export default function Signup() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  return <SignupGate key={token ?? "open"} token={token} />;
}

function SignupGate({ token }: { token?: string }) {
  const { client } = useSession();
  const router = useRouter();
  const [state, setState] = useState<{ token?: string; invitation?: Invitation } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!token) {
        const open = await registrationIsOpen(client);
        if (!active) return;
        if (open) setState({}); else router.replace("/(auth)/request-access");
        return;
      }
      try {
        const invitation = await client.validateInvitation(token);
        if (active) setState({ token, invitation: { ...invitation, token } });
      } catch (caught) {
        if (active) setError(caught instanceof ApiError && caught.status === 403
          ? "This signup link is invalid, expired, or already used. Contact support for a replacement link."
          : "We couldn’t verify your signup link. Please reload to try again or contact support.");
      }
    })();
    return () => { active = false; };
  }, [client, router, token, attempt]);
  if (state && state.token === token) return <AuthForm key={token ?? "open"} mode="signup" invitation={state.invitation} />;
  if (!error) return <ActivityIndicator accessibilityLabel="Loading signup" />;
  return <SafeAreaView style={{ flex: 1 }}><ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.page}><View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>Signup link unavailable</Text>
    <ErrorBox message={error} /><Button title="Try again" onPress={() => { setError(""); setAttempt(n => n + 1); }} />
    <Text accessibilityRole="link" style={styles.link} onPress={() => { void Linking.openURL(`mailto:${process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example"}`); }}>Contact support</Text>
    <Link style={styles.link} href="/(auth)/login">Sign in to an existing account</Link>
    <Link style={styles.link} href="/(auth)/request-access">Request MVP access</Link>
  </View></ScrollView></SafeAreaView>;
}
