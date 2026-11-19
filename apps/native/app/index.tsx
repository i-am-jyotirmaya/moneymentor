import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandTile, Button, RegistrationLink } from "../src/ui/AuthForm";
import { Skeleton } from "../src/ui/Skeleton";

import { useSession } from "../src/auth/session";
import { useLegacy } from '../src/workspace/legacy-styles';

export default function Index() { const { styles, colors } = useLegacy();
  const { client, status } = useSession();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Refresh uses the native HttpOnly cookie store, never a JS refresh token.
    void client.restore().catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [client]);
  if (!ready) return <SafeAreaView style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}><Skeleton label="Loading session" style={{ maxWidth: 460, alignSelf: "center" }} /></SafeAreaView>;
  if (status === "authenticated") return <Redirect href="/(tabs)/assistant" />;
  return <SafeAreaView testID="home-screen" style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <View style={{ alignItems: "center" }}><BrandTile /></View>
        <Text accessibilityRole="header" style={[styles.title, { textAlign: "center" }]}>Spndrr</Text>
        <Text style={[styles.text, { fontSize: 16, textAlign: "center" }]}>Sign in to use the assistant input workspace.</Text>
        <Button testID="home-login-button" title="Login" onPress={() => router.push("/(auth)/login")} />
        <RegistrationLink outlined />
      </View>
    </ScrollView>
  </SafeAreaView>;
}
