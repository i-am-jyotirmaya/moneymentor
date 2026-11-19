import { StyleSheet, Text, View } from "react-native";

export function Placeholder({ title }: { title: string }) {
  return <View style={styles.container}><Text style={styles.title}>{title}</Text><Text>Spndrr · M0 scaffold</Text><Text>This screen is coming in a later milestone.</Text></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 28, fontWeight: "600" },
});
