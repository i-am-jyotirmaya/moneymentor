import { ActivityIndicator, Image, Platform, StyleSheet, View } from "react-native";
import { authHero, authMethods } from "../auth/appearance";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

type Method = "email" | "passkey" | "google" | "apple";

const labels = { email: "Email", passkey: "Passkey", google: "Google", apple: "Apple" } as const;
const iconNames = {
  email: { ios: "envelope", android: "mail", web: "mail" },
  passkey: { ios: "person.badge.key", android: "passkey", web: "passkey" },
  apple: { ios: "apple.logo" },
} as const satisfies Record<Exclude<Method, "google">, IconName>;

export function AuthMethodTiles({
  onEmail, onPasskey, passkeyAvailable, busy = false,
}: {
  onEmail: () => void;
  onPasskey: () => void;
  passkeyAvailable: boolean;
  busy?: boolean;
}) {
  return (
    <View style={[styles.row, Platform.OS !== "ios" && styles.threeMethods]}>
      <MethodTile method="email" onPress={onEmail} disabled={busy} testID="login-choose-email" />
      <MethodTile method="passkey" onPress={onPasskey} disabled={busy || !passkeyAvailable}
        unavailable={!passkeyAvailable} loading={busy} testID="login-passkey" />
      <MethodTile method="google" disabled testID="login-google" />
      {Platform.OS === "ios" && <MethodTile method="apple" disabled testID="login-apple" />}
    </View>
  );
}

function MethodTile({
  method, onPress, disabled, testID, unavailable = false, loading = false,
}: {
  method: Method;
  onPress?: () => void;
  disabled: boolean;
  testID: string;
  unavailable?: boolean;
  loading?: boolean;
}) {
  const { scheme, color } = useTheme();
  const palette = authMethods[scheme];
  const provider = method === "google" || method === "apple";
  const status = provider ? "Coming soon" : unavailable ? "Unavailable" : undefined;
  const fill = provider || unavailable ? palette.provider : palette[method];
  const iconColor = method === "apple" ? palette.apple : unavailable ? color.primaryText : authHero.white;
  const label = labels[method];
  const action = method === "passkey" ? "Sign in with a passkey" : `Sign in with ${label}`;

  return (
    <PressableScale testID={testID} accessibilityRole="button" onPress={onPress} disabled={disabled}
      accessibilityLabel={status ? `${action}, ${status.toLowerCase()}` : action}
      accessibilityState={{ disabled, busy: loading }} layer="none" scaleTo={0.92}
      style={styles.target} contentStyle={styles.content}>
      <View style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* Use one tinted silhouette so Android and iOS share the same continuous corners. */}
        <Image source={require("../../assets/auth-method-squircle.png")} resizeMode="stretch"
          style={[styles.silhouette, { tintColor: fill }]} />
        {loading ? <ActivityIndicator color={iconColor} /> : method === "google" ? (
          <Image source={require("../../assets/sign-in-google.png")} resizeMode="contain" style={styles.google} />
        ) : <Icon name={iconNames[method]} size={30} color={iconColor} />}
      </View>
      <Text variant="label" tone={status ? "text2" : "text"} style={styles.label}>{label}</Text>
      {status && <Text variant="caption" tone="text2" style={styles.status}>{status}</Text>}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { width: "100%", maxWidth: 355, alignSelf: "center", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  threeMethods: { maxWidth: 302, gap: 15 },
  target: { flex: 1 },
  content: { alignItems: "center" },
  tile: { width: "100%", maxWidth: 74, aspectRatio: 1, justifyContent: "center", alignItems: "center" },
  silhouette: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  google: { width: 26, height: 26 },
  label: { marginTop: 7, textAlign: "center" },
  status: { textAlign: "center", marginTop: 2, fontSize: 11, lineHeight: 14 },
});
