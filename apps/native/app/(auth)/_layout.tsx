import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { authHero } from "../../src/auth/appearance";

export default function AuthLayout() {
  const reduced = useReducedMotion();
  return <Stack screenOptions={{ headerShown: false, animation: reduced ? "none" : "fade", contentStyle: { backgroundColor: authHero.background } }} />;
}
