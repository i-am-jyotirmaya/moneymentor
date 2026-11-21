import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { I18nManager, Keyboard, Platform, ScrollView, StyleSheet, Text as NativeText, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AndroidKeyboardFrame } from "./AndroidKeyboardFrame";
import { authHero } from "../auth/appearance";
import { AuthBrand, AuthSlice, authEntrance, useAuthStatusBar } from "./AuthVisuals";
import { Icon } from "./Icon";
import { dur } from "./motion";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

const titleEntrance = authEntrance();
const formEntrance = authEntrance(dur.instant);

export function AuthFrame({
  title, titleAccent, children, expandedHero = false, testID,
}: {
  title: string; titleAccent?: string; children: ReactNode; expandedHero?: boolean; testID?: string;
}) {
  const router = useRouter();
  const { color, radius } = useTheme();
  const { top } = useSafeAreaInsets();
  useAuthStatusBar();

  function back() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <View testID={testID} style={styles.root}>
      <SafeAreaView edges={["left", "right"]} style={styles.safeArea}>
        <AndroidKeyboardFrame>
          <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <View style={[styles.hero, { minHeight: (expandedHero ? 258 : 195) + top }]}>
              <View pointerEvents="none" style={[styles.illustration, { top: top - 4 }]}>
                <AuthSlice style={[styles.slice, expandedHero && styles.expandedSlice]} />
                <View style={styles.shade} />
              </View>
              <View style={[styles.heroContent, { paddingTop: top + 8 }]}>
                <View style={styles.nav}>
                  <PressableScale accessibilityRole="button" accessibilityLabel="Go back" onPress={back}
                    layer="on-primary" contentStyle={styles.back}>
                    <Icon name={I18nManager.isRTL
                      ? { ios: "arrow.right", android: "arrow_forward" }
                      : { ios: "arrow.left", android: "arrow_back" }} size={20} color={authHero.white} />
                  </PressableScale>
                  <AuthBrand compact />
                </View>
                <Animated.View entering={titleEntrance} style={expandedHero && styles.expandedTitle}>
                  <Text accessibilityRole="header" variant="displayXl" style={[styles.title, expandedHero && styles.largeTitle]}>
                    {title}{titleAccent && <NativeText style={styles.titleAccent}>{"\n"}{titleAccent}</NativeText>}
                  </Text>
                </Animated.View>
              </View>
            </View>

            <Animated.View entering={formEntrance} style={[styles.sheet, {
              backgroundColor: color.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
            }]}>
              <SafeAreaView edges={["bottom"]} style={[styles.form, expandedHero && styles.expandedForm]}>
                {children}
              </SafeAreaView>
            </Animated.View>
          </ScrollView>
        </AndroidKeyboardFrame>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: authHero.headerBackground },
  safeArea: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: {
    overflow: "hidden", backgroundColor: authHero.headerFill,
    backgroundImage: authHero.formGradient,
  },
  heroContent: { width: "100%", maxWidth: 520, alignSelf: "center", gap: 12, paddingHorizontal: 24, paddingBottom: 34 },
  illustration: { ...StyleSheet.absoluteFill, width: "100%", maxWidth: 520, alignSelf: "center" },
  slice: { position: "absolute", end: -68, top: -9, width: "84%", height: "122%" },
  expandedSlice: { top: 0, height: "119%" },
  shade: {
    ...StyleSheet.absoluteFill,
    backgroundImage: authHero.formImageShade,
  },
  nav: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: {
    width: 48, height: 48, alignItems: "center", borderRadius: 16,
    backgroundColor: authHero.backFill, borderWidth: 1, borderColor: authHero.backOutline,
  },
  title: { color: authHero.white, fontSize: 42, lineHeight: 43, letterSpacing: -1.9 },
  titleAccent: { color: authHero.ice },
  expandedTitle: { marginTop: 13 },
  largeTitle: { fontSize: 56, lineHeight: 57, letterSpacing: -2.4 },
  sheet: { flexGrow: 1, marginTop: -12 },
  form: { flexGrow: 1, width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 24, paddingTop: 19, paddingBottom: 9, gap: 12 },
  expandedForm: { paddingTop: 25, gap: 16 },
});
