import { StyleSheet } from "react-native";

// Native Slice palette; neutrals retain the shared light semantic roles.
export const colors = {
  background: "#F3F5F9", ink: "#0E1220", muted: "#4A5168", muted2: "#5F6680",
  surface: "#ECEFF5", border: "#CBD0DC", accent: "#0B7A4E", accentSoft: "#DCEFE5",
  danger: "#BA1A1A", dangerBg: "#FFDAD6", dangerBorder: "#BA1A1A",
};
export const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  card: { width: "100%", maxWidth: 460, alignSelf: "center", backgroundColor: "white", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "600", color: colors.ink },
  text: { fontSize: 14, lineHeight: 24, color: colors.muted },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  field: { gap: 8 },
  input: { minWidth: 48, minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  button: { minWidth: 48, minHeight: 52, borderRadius: 8, padding: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 14, textAlign: "center" },
  link: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  linkTarget: { minWidth: 48, minHeight: 48, justifyContent: "center", paddingVertical: 10 },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 8, padding: 12, lineHeight: 24 },
});
