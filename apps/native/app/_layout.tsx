import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useContext, useEffect } from "react";
import { BackHandler } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { backAction } from "../src/lib/back-policy";
import { DeviceLockProvider, useDeviceLock } from "../src/auth/device-lock";
import { SessionProvider, useSession } from "../src/auth/session";
import { appFonts } from "../src/ui/fonts";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import { ToastProvider } from "../src/ui/Toast";
import { DOCK_SPACE } from "../src/workspace/dock";
import { colors } from "../src/ui/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigation() {
  const { status } = useSession();
  const deviceLock = useDeviceLock();
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
    if (deviceLock === "open" && inWorkspace && (status === "signedOut" || status === "unavailable")) {
      router.replace("/(auth)/login");
    }
  }, [deviceLock, status, inWorkspace, router]);
  // Expo Router owns both the linking/navigation container and the root safe-area provider.
  // Keep one persistent Stack and let +native-intent normalize external URLs.
  return <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.background } }} />;
}
export default function RootLayout() {
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const [loaded, error] = useFonts(appFonts);
  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ToastProvider bottomOffset={bottomInset + DOCK_SPACE}>
          <SessionProvider><DeviceLockProvider><Navigation /></DeviceLockProvider></SessionProvider>
        </ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
