import { StyleSheet } from "react-native";

// Values shared with apps/web/app/globals.css.
export const colors = {
  background: "#f4f7f6", ink: "#102b26", muted: "#61736e", muted2: "#98a8a4",
  surface: "#f7faf9", border: "#dce6e2", accent: "#0e8878", accentSoft: "#e3f4ef",
  danger: "#9b1c1c", dangerBg: "#fff1f0", dangerBorder: "#f3c2bd",
};
export const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, justifyContent: "center", backgroundColor: colors.background },
  card: { width: "100%", maxWidth: 460, alignSelf: "center", backgroundColor: "white", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "600", color: colors.ink },
  text: { fontSize: 14, lineHeight: 24, color: colors.muted },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  field: { gap: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  button: { minHeight: 52, borderRadius: 8, padding: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: "600", paddingVertical: 10 },
  error: { color: colors.danger, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 8, padding: 12, lineHeight: 24 },
});
