import { Image, StyleSheet, useColorScheme, View } from "react-native";
import { darkTheme, lightTheme } from "./theme";

export function StartupSplash() {
  const dark = useColorScheme() === "dark";
  const { bg } = (dark ? darkTheme : lightTheme).color;
  const artwork = dark ? require("../../assets/splash-dark.png") : require("../../assets/splash.png");

  return (
    <View testID="startup-splash" accessible accessibilityLabel="Loading Spndrr" accessibilityRole="progressbar"
      accessibilityState={{ busy: true }} style={[StyleSheet.absoluteFill, styles.screen, { backgroundColor: bg }]}>
      <Image accessible={false} source={artwork} resizeMode="contain" style={styles.artwork} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center" },
  artwork: { width: 200, height: 200 },
});
