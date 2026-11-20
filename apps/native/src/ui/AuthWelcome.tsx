import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { authHero } from "../auth/appearance";
import { AuthBrand, AuthPrimary, AuthSlice, authEntrance, useAuthStatusBar } from "./AuthVisuals";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { dur } from "./motion";

const introEntrance = authEntrance(dur.instant);
const artEntrance = authEntrance(dur.fast);

export function AuthWelcome({
  open, onRegister, onSignIn, testID, signInTestID,
}: {
  open: boolean; onRegister: () => void; onSignIn: () => void; testID: string; signInTestID: string;
}) {
  const { width } = useWindowDimensions();
  const artWidth = Math.min(520, width);
  const artHeight = Math.min(342, Math.max(240, artWidth * 0.78));
  const displaySize = Math.max(36, Math.min(56, (width - 48) * 0.156));
  useAuthStatusBar();

  return (
    <SafeAreaView testID={testID} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.masthead}>
            <AuthBrand />
            {!open && <View style={styles.badge}><View style={styles.dot} /><Text variant="caption" style={styles.badgeLabel}>Early access</Text></View>}
          </View>
          <Animated.View entering={introEntrance} style={styles.intro}>
            <Text variant="displayXl" accessibilityRole="header"
              style={[styles.title, { fontSize: displaySize, lineHeight: displaySize + 1 }]}>
              Your money,{"\n"}<Text variant="displayXl" style={{ fontSize: displaySize, lineHeight: displaySize + 1, color: authHero.ice, letterSpacing: -displaySize * 0.045 }}>in plain words.</Text>
            </Text>
            <Text variant="bodyL" style={styles.promise}>Type what you spent. Spndrr sorts it and shows where your money goes.</Text>
          </Animated.View>

          <Animated.View entering={artEntrance} style={[styles.art, { minHeight: artHeight }]}
            accessible accessibilityRole="image" accessibilityLabel="Example. Type 240 rupees on lunch and Spndrr logs it under Dining.">
            <AuthSlice cover style={[styles.slice, { width: artWidth, height: artHeight }]} />
            <View style={styles.demo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.exampleInput}>
                <Icon name={{ ios: "sparkle", android: "auto_awesome" }} size={14} color={authHero.ice} />
                <Text variant="label" style={[styles.exampleText, styles.exampleInputText]}>₹240 on lunch</Text>
                <Icon name={{ ios: "return", android: "keyboard_return" }} size={15} color={authHero.ice} />
              </View>
              <View style={styles.exampleResult}>
                <Icon name={{ ios: "checkmark.circle", android: "check_circle" }} size={16} color={authHero.ice} />
                <Text variant="caption" style={styles.exampleText}>Expense logged · Dining</Text>
              </View>
            </View>
          </Animated.View>

          <View style={styles.actions}>
            <AuthPrimary light label={open ? "Create an account" : "Request MVP access"} onPress={onRegister} />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Already have an account?</Text>
              <PressableScale testID={signInTestID} accessibilityRole="link" accessibilityLabel="Sign in"
                onPress={onSignIn} layer="on-primary" contentStyle={styles.signIn}>
                <Text variant="label" style={styles.signInLabel}>Sign in</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: authHero.background,
    backgroundImage: authHero.welcomeGradient,
  },
  scroll: { flexGrow: 1 },
  content: { flexGrow: 1, width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  masthead: { minHeight: 32, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 6, borderColor: authHero.badgeOutline,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: authHero.badgeDot },
  badgeLabel: { color: authHero.badgeText },
  intro: { marginTop: 28, gap: 14 },
  title: { letterSpacing: -2, color: authHero.white },
  promise: { color: authHero.muted, maxWidth: 310 },
  art: { justifyContent: "flex-end", marginHorizontal: -24, paddingHorizontal: 24, paddingTop: 132, paddingBottom: 8 },
  slice: { position: "absolute", top: 0, alignSelf: "center" },
  demo: { alignSelf: "flex-start", minWidth: 194, maxWidth: "100%", backgroundColor: authHero.demoFill, borderColor: authHero.demoOutline, borderWidth: 1, borderRadius: 15, padding: 4 },
  exampleInput: { flexDirection: "row", alignItems: "center", backgroundColor: authHero.demoInput, borderRadius: 10, gap: 8, paddingVertical: 5, paddingHorizontal: 8 },
  exampleText: { flexShrink: 1, color: authHero.white },
  exampleInputText: { flexGrow: 1 },
  exampleResult: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 4, paddingHorizontal: 8 },
  actions: { marginTop: "auto", paddingTop: 12, gap: 4 },
  switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 4 },
  switchLabel: { color: authHero.muted },
  signIn: { minHeight: 44, paddingHorizontal: 6, borderRadius: 10 },
  signInLabel: { color: authHero.link, textDecorationLine: "underline" },
});
