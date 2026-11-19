import { Stack } from "expo-router";
import { colors } from "../../src/ui/theme";
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: colors.background } }} />;
}
