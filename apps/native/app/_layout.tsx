import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/auth/session";

function Navigation() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (segments[0] === "(tabs)" && (status === "signedOut" || status === "unavailable")) {
      router.replace("/(auth)/login");
    }
  }, [status, segments, router]);
  return <Stack screenOptions={{ headerShown: false }} />;
}
export default function RootLayout() {
  return <SafeAreaProvider><SessionProvider><Navigation /></SessionProvider></SafeAreaProvider>;
}
