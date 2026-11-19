import { WorkspaceBannerVisible } from '../workspace/banner';
import { useOffline } from '../workspace/connection';
import { Link, useRouter } from "expo-router";
import { useContext, useEffect, useState } from "react";
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { registrationIsOpen } from "../auth/registration";
import { useSession } from "../auth/session";
import { authFieldLocks, validateAuthForm } from "../auth/validation";
import { invitationToken } from "../lib/deep-links";
import { AndroidKeyboardFrame } from "./AndroidKeyboardFrame";
import { PrivacyPolicySheet } from "./PrivacyPolicySheet";
import { colors, styles } from "./theme";

export type Invitation = { token: string; name: string; email: string };
type PlaceholderInputProps = TextInputProps & { wrapperStyle?: StyleProp<ViewStyle>; placeholderStyle?: StyleProp<TextStyle> };
/** Multiline fields keep typing/wrapping normally, but the empty hint stays on one line. */
export function PlaceholderInput({ placeholder, placeholderTextColor = colors.muted2, multiline, wrapperStyle, placeholderStyle, accessibilityHint, ...props }: PlaceholderInputProps) {
  // Native single-line inputs already truncate their placeholder. Only controlled multiline inputs need the overlay.
  if (!multiline || !placeholder || typeof props.value !== "string") {
    return <TextInput {...props} multiline={multiline} placeholder={placeholder} placeholderTextColor={placeholderTextColor} accessibilityHint={accessibilityHint} />;
  }
  return <View style={[{ minWidth: 0 }, wrapperStyle]}>
    <TextInput {...props} multiline accessibilityHint={accessibilityHint ?? placeholder} />
    {!props.value && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={local.placeholderOverlay}>
      <Text numberOfLines={1} ellipsizeMode="tail" allowFontScaling={props.allowFontScaling} maxFontSizeMultiplier={props.maxFontSizeMultiplier} style={[local.placeholder, { color: placeholderTextColor }, placeholderStyle]}>{placeholder}</Text>
    </View>}
  </View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><PlaceholderInput accessibilityLabel={label} style={styles.input} {...props} /></View>;
}
export function ErrorBox({ message }: { message: string }) {
  const bannerVisible = useContext(WorkspaceBannerVisible);
  return message && !bannerVisible ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{message}</Text> : null;
}
export function Button({ title, onPress, disabled = false, testID, write = false }: { title: string; onPress: () => void; disabled?: boolean; testID?: string; write?: boolean }) {
  const offline = useOffline();
  disabled = disabled || (write && offline);
  return <Pressable accessibilityHint={write && offline ? "You're offline. Reconnect before making changes." : undefined} testID={testID} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.65 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function BrandTile() {
  return <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={require("../../assets/spndrr-mark.png")} resizeMode="contain" style={{ width: 48, height: 48 }} />;
}
export function RegistrationLink({ outlined = false }: { outlined?: boolean }) {
  const { client } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void registrationIsOpen(client).then(value => { if (active) setOpen(value); });
    return () => { active = false; };
  }, [client]);
  return <Pressable accessibilityRole="link" onPress={() => router.push(open ? "/(auth)/signup" : "/(auth)/request-access")} style={outlined ? [styles.button, { backgroundColor: "white", borderWidth: 1, borderColor: colors.border }] : styles.linkTarget}>
      <Text style={outlined ? [styles.buttonText, { color: colors.ink, textAlign: "center" }] : styles.link}>{open ? "Create a new account" : "Request MVP access"}</Text>
  </Pressable>;
}
function InvitationLinkForm() {
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return <View style={{ gap: 16, paddingTop: 24 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.linkTarget}><Text style={styles.link}>Already approved? Open your invitation</Text></Pressable>
    {expanded && <>
      <Field label="Approved signup link" value={link} onChangeText={setLink} autoComplete="off" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <ErrorBox message={error} />
      <Button title="Open invitation" onPress={() => {
        const token = invitationToken(link);
        if (!token) { setError("Paste the complete approved signup link from your Spndrr email."); return; }
        router.push({ pathname: "/(auth)/signup", params: { token } });
      }} />
    </>}
  </View>;
}
export function AuthForm({ mode, invitation }: { mode: "login" | "signup" | "request"; invitation?: Invitation }) {
  const { client } = useSession();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(invitation?.name ?? "");
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup", request = mode === "request";
  const locks = authFieldLocks(invitation);
  function openPolicy() { Keyboard.dismiss(); setPolicy(true); }
  async function submit() {
    if (busy) return;
    const validationError = validateAuthForm({ mode, displayName, email, password, accepted });
    if (validationError) { setError(validationError); return; }
    Keyboard.dismiss(); setError(""); setBusy(true);
    try {
      if (request) {
        await client.requestAccess({ name: displayName.trim(), email: email.trim(), reason: reason.trim() || undefined });
        setSent(true);
      } else {
        if (signup) await client.signup({ invitationToken: invitation?.token, displayName: displayName.trim(), email: email.trim(), password, privacyPolicyVersion: "2026-07-26-ai-planning.1", acceptPrivacyPolicy: accepted });
        else await client.login(email.trim(), password);
        router.replace("/(tabs)/assistant");
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.errors.join(" ") : "Could not connect to Spndrr. Please try again in a moment.");
    } finally { setBusy(false); }
  }
  return <SafeAreaView testID={mode === "login" ? "login-screen" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Android uses native resize plus measured fallback IME overlap. iOS applies one scroll inset. */}
      <AndroidKeyboardFrame>
      <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        <View style={styles.card}>
          <Pressable accessibilityRole="link" accessibilityLabel="Spndrr" onPress={() => router.push("/(auth)/login")} style={{ minHeight: 48, minWidth: 48, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <BrandTile />
              <Text style={[styles.title, { fontSize: 20, flexShrink: 1 }]}>Spndrr</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{request ? "Request MVP access" : signup ? "Create your account" : "Sign in"}</Text>
          <Text style={styles.text}>{request ? "Spndrr is currently available by approval. Tell us a little about yourself to request access." : signup ? "Start with the assistant input, then build the rest around real data." : "Continue to your Spndrr workspace."}</Text>
          {sent ? <Text accessibilityLiveRegion="polite" style={[styles.text, { backgroundColor: colors.accentSoft, padding: 16 }]}>Your request has been received. We’ll email you if access is approved.</Text> : <>
            {mode !== "login" && <Field label="Display name" placeholder="Aarav Shah" maxLength={128} value={displayName} onChangeText={setDisplayName} autoComplete="name" textContentType="name" editable={!locks.displayName} />}
            <Field label="Email" testID={mode === "login" ? "login-email" : undefined} placeholder="name@example.com" maxLength={256} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!locks.email} />
            {!request && <Field label="Password" testID={mode === "login" ? "login-password" : undefined} placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={signup ? "new-password" : "current-password"} textContentType={signup ? "newPassword" : "password"} />}
            {request && <>
              <Field label="Why would you like access? (optional)" value={reason} onChangeText={setReason} maxLength={1000} multiline style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]} />
              <Text style={styles.text}>We’ll use these details to review your request and contact you about access.</Text>
              <Pressable accessibilityRole="link" onPress={openPolicy} style={styles.linkTarget}><Text style={styles.link}>Privacy policy</Text></Pressable>
            </>}
            {signup && <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept beta privacy policy" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={{ fontSize: 24, color: colors.accent }}>{accepted ? "☑" : "☐"}</Text></Pressable>
              <View style={{ flex: 1 }}><Text style={styles.text}>I accept the beta privacy policy (version 2026-07-26-ai-planning.1).</Text><Pressable accessibilityRole="link" onPress={openPolicy} style={styles.linkTarget}><Text style={styles.link}>Read beta privacy policy</Text></Pressable></View>
            </View>}
            <ErrorBox message={error} />
            <Button disabled={busy} testID={mode === "login" ? "login-submit" : undefined} title={busy ? "Working..." : request ? "Request MVP access" : signup ? "Create account" : "Sign in"} onPress={() => { void submit(); }} />
          </>}
          {mode === "login" ? <RegistrationLink /> : <Link asChild href="/(auth)/login"><Pressable accessibilityRole="link" style={styles.linkTarget}><Text style={styles.link}>I already have an account</Text></Pressable></Link>}
        </View>
        {request && <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}><InvitationLinkForm /></View>}
      </ScrollView>
      </AndroidKeyboardFrame>
    <PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} />
  </SafeAreaView>;
}
const local = StyleSheet.create({
  placeholderOverlay: { position: "absolute", top: 12, left: 13, right: 13 },
  placeholder: { fontSize: 16 },
});
