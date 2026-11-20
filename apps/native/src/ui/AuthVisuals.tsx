import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, I18nManager, Image, StatusBar, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";
import { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Icon } from "./Icon";
import { dur, ease } from "./motion";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export const authHero = {
  background: "#090F29",
  white: "#F8FAFF",
  ice: "#B9C9FF",
  muted: "#CBD6F5",
};

export const authEntrance = (delay = 0) => FadeInDown.delay(delay).duration(dur.slow).easing(ease.decelerate)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] })
  .reduceMotion(ReduceMotion.System);

export function useAuthStatusBar() {
  useFocusEffect(useCallback(() => {
    const entry = StatusBar.pushStackEntry({ barStyle: "light-content" });
    return () => StatusBar.popStackEntry(entry);
  }, []));
}

export function AuthBrand({ compact = false }: { compact?: boolean }) {
  const size = compact ? 24 : 28;
  return (
    <View style={styles.brand}>
      <Image accessible={false} source={require("../../assets/spndrr-mark-dark.png")}
        resizeMode="contain" style={{ width: size, height: size }} />
      <Text variant={compact ? "titleL" : "headline"} style={{ color: authHero.white }}>Spndrr</Text>
    </View>
  );
}

export function AuthSlice({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      source={require("../../assets/auth-slice.png")} resizeMode="contain" style={style} />
  );
}

export function AuthPrimary({
  label, onPress, testID, light = false, loading = false,
}: {
  label: string; onPress: () => void; testID?: string; light?: boolean; loading?: boolean;
}) {
  const { color, radius } = useTheme();
  const foreground = light ? "#101941" : color.onPrimary;
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      accessibilityState={{ busy: loading, disabled: loading }} disabled={loading} layer={light ? "primary" : "on-primary"}
      pressedBackground={light ? undefined : color.primaryPressed}
      contentStyle={[styles.primary, {
        borderRadius: radius.l,
        backgroundColor: light ? "#E3EAFF" : color.primary,
        backgroundImage: light ? "linear-gradient(105deg, #F3F6FF, #CBD8FF)" : undefined,
      }]}>
      <View pointerEvents="none" style={styles.arrow}>
        {loading ? <ActivityIndicator color={foreground} /> :
          <Icon name={I18nManager.isRTL
            ? { ios: "arrow.left", android: "arrow_back" }
            : { ios: "arrow.right", android: "arrow_forward" }} size={20} color={foreground} />}
      </View>
      <Text variant="label" style={{ textAlign: "center", color: foreground }}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  primary: { minHeight: 56, paddingHorizontal: 44, paddingVertical: 12 },
  arrow: { position: "absolute", end: 15, top: 0, bottom: 0, width: 22, alignItems: "center", justifyContent: "center" },
});
