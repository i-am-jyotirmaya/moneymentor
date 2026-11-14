import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, styles } from "./theme";

const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@spndrr.example";
// Full policy copy from the web policy; keep paragraphs in source order.
const content = [
  ["p", "Beta policy · Version 2026-07-26-ai-planning.1"],
  ["Heading", "AI goal planning"],
  ["p", "When you request an AI goal plan, Spndrr sends a minimized financial summary to its configured model provider. The summary contains calculated totals and planning constraints, not transaction descriptions, merchant names, account identity, email, or raw transaction history."],
  ["p", "Shared goals use another member's private aggregates only after that member opts in for the specific goal. Members can revoke that consent for future planning runs."],
  ["Title", "Spndrr beta privacy policy"],
  ["p", "This plain-language beta policy is a product draft and must receive legal review before general availability."],
  ["Heading", "What we store"],
  ["p", "We store your account profile, settings, household memberships and invitations, assistant messages, and the financial records you choose to capture."],
  ["Heading", "How we use it"],
  ["p", "We use your data to run Spndrr, calculate reports deterministically, deliver invitations, secure sessions, diagnose reliability problems, and improve the beta. We do not use AI-generated values as the source of truth for financial totals."],
  ["Heading", "Households and visibility"],
  ["p", "Private transactions remain visible only to you. Household-visible transactions can be read by active members of that household. Viewer members cannot change financial records."],
  ["Heading", "Your controls"],
  ["p", "You can export your data, delete accidental captures for 30 days before purge, or delete your account from Settings. Shared household records may be retained only in anonymized form so other members keep accurate totals."],
  ["Heading", "Contact"],
] as const;

export function PrivacyPolicySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} presentationStyle="fullScreen" animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={local.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close privacy policy" onPress={onClose} style={local.close}><Text style={{ fontSize: 24 }}>×</Text></Pressable>
        <Text accessibilityRole="header" style={local.barTitle}>Privacy policy</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 24), gap: 16 }}>
        {content.map(([kind, text], index) => <Text key={text} accessibilityRole={kind === "p" ? undefined : "header"} style={index === 0 ? [styles.label, { color: colors.accent }] : kind === "p" ? styles.text : [styles.title, { fontSize: kind === "Title" ? 30 : 20 }]}>{text}</Text>)}
        <Text style={styles.text}>Questions or support requests: <Text accessibilityRole="link" style={styles.link} onPress={() => { void Linking.openURL(`mailto:${supportEmail}`); }}>{supportEmail}</Text>.</Text>
      </ScrollView>
    </View>
  </Modal>;
}
const local = StyleSheet.create({
  // Text may wrap at large font scales; only the close target has a fixed size.
  bar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 4, backgroundColor: "white", borderBottomWidth: 1, borderColor: colors.border },
  close: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  barTitle: { flex: 1, fontSize: 18, fontWeight: "600", color: colors.ink, paddingVertical: 8 },
});
