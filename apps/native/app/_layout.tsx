import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { BackHandler } from "react-native";
import { backAction } from "../src/lib/back-policy";
import { SessionProvider, useSession } from "../src/auth/session";
import { appFonts } from "../src/ui/fonts";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import { colors } from "../src/ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [loaded, error] = useFonts(appFonts);
  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider><SessionProvider><Navigation /></SessionProvider></ThemeProvider>
    </GestureHandlerRootView>
  );
}
