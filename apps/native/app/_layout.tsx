import { Stack, useRouter, useSegments, usePathname } from "expo-router";
import { useEffect } from "react";
import { BackHandler } from "react-native";
import { backAction } from "../src/lib/back-policy";
import { SessionProvider, useSession } from "../src/auth/session";
import { colors } from "../src/ui/theme";

function Navigation() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const pathname = usePathname();
  const inWorkspace = segments[0] === "(tabs)";
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const action = backAction(router.canGoBack(), inWorkspace, pathname);
      if (action === "pop") router.back();
      else if (action === "assistant") router.replace("/(tabs)/assistant");
      else if (action === "home") router.replace("/");
      return action !== "exit";
    });
    return () => subscription.remove();
  }, [router, inWorkspace, pathname]);
  useEffect(() => {
    if (inWorkspace && (status === "signedOut" || status === "unavailable")) {
      router.replace("/(auth)/login");
    }
  }, [status, inWorkspace, router]);
  // Expo Router owns both the linking/navigation container and the root safe-area provider.
  // Keep one persistent Stack and let +native-intent normalize external URLs.
  return <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.background } }} />;
}
export default function RootLayout() {
  return <SessionProvider><Navigation /></SessionProvider>;
}
