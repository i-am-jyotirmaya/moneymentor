import { Stack, useRouter, useSegments, usePathname } from "expo-router";
import { useEffect } from "react";
import { BackHandler } from "react-native";
import { backAction } from "../src/lib/back-policy";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/auth/session";

function Navigation() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const action = backAction(router.canGoBack(), segments[0] === "(tabs)", pathname);
      if (action === "pop") router.back();
      else if (action === "assistant") router.replace("/(tabs)/assistant");
      else if (action === "home") router.replace("/");
      return action !== "exit";
    });
    return () => subscription.remove();
  }, [router, segments, pathname]);
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
