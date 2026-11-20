import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../src/auth/session";
import { AuthWelcome } from "../src/ui/AuthWelcome";
import { authHero } from "../src/ui/AuthVisuals";
import { Skeleton } from "../src/ui/Skeleton";
import { useRegistrationDestination } from "../src/ui/AuthForm";

export default function Index() {
  const { client, status } = useSession();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    // Refresh uses the native HttpOnly cookie store, never a JS refresh token.
    void client.restore().catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [client]);

  if (!ready) return <SafeAreaView style={{ flex: 1, justifyContent: "center", backgroundColor: authHero.background }}>
    <Skeleton label="Loading session" style={{ maxWidth: 460, alignSelf: "center" }} />
  </SafeAreaView>;
  if (status === "authenticated") return <Redirect href="/(tabs)/assistant" />;
  return <Welcome />;
}

function Welcome() {
  const router = useRouter();
  const { open, href } = useRegistrationDestination();
  return <AuthWelcome testID="home-screen" signInTestID="home-login-button" open={open}
    onRegister={() => router.push(href)} onSignIn={() => router.push("/(auth)/login")} />;
}
