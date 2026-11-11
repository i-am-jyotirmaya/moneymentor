import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { registrationIsOpen } from "../auth/registration";
import { useSession } from "../auth/session";
import { invitationToken } from "../lib/deep-links";
import { PrivacyPolicySheet } from "./PrivacyPolicySheet";
import { colors, styles } from "./theme";

export type Invitation = { token: string; name: string; email: string };
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted2} style={styles.input} {...props} /></View>;
}
export function ErrorBox({ message }: { message: string }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{message}</Text> : null;
}
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.65 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function BrandTile() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.ink }} />;
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
  return <Pressable accessibilityRole="link" onPress={() => router.push(open ? "/(auth)/signup" : "/(auth)/request-access")} style={StyleSheet.flatten(outlined ? [styles.button, { backgroundColor: "white", borderWidth: 1, borderColor: colors.border }] : undefined)}>
      <Text style={outlined ? [styles.buttonText, { color: colors.ink, textAlign: "center" }] : styles.link}>{open ? "Create a new account" : "Request MVP access"}</Text>
  </Pressable>;
}
function InvitationLinkForm() {
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return <View style={{ gap: 16, paddingTop: 24 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}><Text style={styles.link}>Already approved? Open your invitation</Text></Pressable>
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
  async function submit() {
    if (busy) return;
    // RN has no HTML required/type=email constraint validation. Only mirror those
    // browser submit blockers here; password length remains server validation.
    if ((mode !== "login" && !displayName) || !email || (!request && !password)) { setError("Please fill out all required fields."); return; }
    if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) { setError("Please enter a valid email address."); return; }
    if (signup && !accepted) { setError("Please accept the beta privacy policy."); return; }
    setError(""); setBusy(true);
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
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
        <View style={styles.card}>
          <Pressable accessibilityRole="link" accessibilityLabel="Spndrr" onPress={() => router.push("/(auth)/login")} style={StyleSheet.flatten({ flexDirection: "row", alignItems: "center", gap: 12 })}>
              <BrandTile />
              <Text style={[styles.title, { fontSize: 20, flexShrink: 1 }]}>Spndrr</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{request ? "Request MVP access" : signup ? "Create your account" : "Sign in"}</Text>
          <Text style={styles.text}>{request ? "Spndrr is currently available by approval. Tell us a little about yourself to request access." : signup ? "Start with the assistant input, then build the rest around real data." : "Continue to your Spndrr workspace."}</Text>
          {sent ? <Text accessibilityLiveRegion="polite" style={[styles.text, { backgroundColor: colors.accentSoft, padding: 16 }]}>Your request has been received. We’ll email you if access is approved.</Text> : <>
            {mode !== "login" && <Field label="Display name" placeholder="Aarav Shah" maxLength={128} value={displayName} onChangeText={setDisplayName} autoComplete="name" textContentType="name" editable={!invitation} />}
            <Field label="Email" placeholder="name@example.com" maxLength={256} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!invitation} />
            {!request && <Field label="Password" placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={signup ? "new-password" : "current-password"} textContentType={signup ? "newPassword" : "password"} />}
            {request && <>
              <Field label="Why would you like access? (optional)" value={reason} onChangeText={setReason} maxLength={1000} multiline style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]} />
              <Text style={styles.text}>We’ll use these details to review your request and contact you about access. <Text accessibilityRole="link" style={styles.link} onPress={() => setPolicy(true)}>Privacy policy</Text></Text>
            </>}
            {signup && <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept beta privacy policy" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)} style={{ minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" }}><Text style={{ fontSize: 24, color: colors.accent }}>{accepted ? "☑" : "☐"}</Text></Pressable>
              <Text style={[styles.text, { flex: 1 }]}>I accept the <Text accessibilityRole="link" onPress={() => setPolicy(true)} style={styles.link}>beta privacy policy</Text> (version 2026-07-26-ai-planning.1).</Text>
            </View>}
            <ErrorBox message={error} />
            <Button disabled={busy} title={busy ? "Working..." : request ? "Request MVP access" : signup ? "Create account" : "Sign in"} onPress={() => { void submit(); }} />
          </>}
          {mode === "login" ? <RegistrationLink /> : <Link style={styles.link} href="/(auth)/login">I already have an account</Link>}
        </View>
        {request && <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}><InvitationLinkForm /></View>}
      </ScrollView>
    </KeyboardAvoidingView>
    <PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} />
  </SafeAreaView>;
}
