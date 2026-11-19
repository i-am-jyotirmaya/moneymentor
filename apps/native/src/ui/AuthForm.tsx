import { WorkspaceBannerVisible } from '../workspace/banner';
import { useOffline } from '../workspace/connection';
import { Link, useRouter } from "expo-router";
import { useContext, useEffect, useState } from "react";
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text as NativeText, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { registrationIsOpen } from "../auth/registration";
import { useSession } from "../auth/session";
import { authFieldLocks, validateAuthForm } from "../auth/validation";
import { invitationToken } from "../lib/deep-links";
import { AndroidKeyboardFrame } from "./AndroidKeyboardFrame";
import { Button as UiButton } from "./Button";
import { withAlpha } from "./color";
import { Icon, type IconName } from "./Icon";
import { PrivacyPolicySheet } from "./PrivacyPolicySheet";
import { Text } from "./Text";
import { useTheme, type ThemeValue } from "./ThemeProvider";
import { useThemedStyles } from "./useThemedStyles";
import { useLegacy } from '../workspace/legacy-styles';

export type Invitation = { token: string; name: string; email: string };
type PlaceholderInputProps = TextInputProps & { wrapperStyle?: StyleProp<ViewStyle>; placeholderStyle?: StyleProp<TextStyle> };
/** Multiline fields keep typing/wrapping normally, but the empty hint stays on one line. */
export function PlaceholderInput({ placeholder, placeholderTextColor, multiline, wrapperStyle, placeholderStyle, accessibilityHint, ...props }: PlaceholderInputProps) {
  const { color } = useTheme();
  const hint = placeholderTextColor ?? color.text3;
  // Native single-line inputs already truncate their placeholder. Only controlled multiline inputs need the overlay.
  if (!multiline || !placeholder || typeof props.value !== "string") {
    return <TextInput {...props} multiline={multiline} placeholder={placeholder} placeholderTextColor={hint} accessibilityHint={accessibilityHint} />;
  }
  return <View style={[{ minWidth: 0 }, wrapperStyle]}>
    <TextInput {...props} multiline accessibilityHint={accessibilityHint ?? placeholder} />
    {!props.value && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={local.placeholderOverlay}>
      <NativeText numberOfLines={1} ellipsizeMode="tail" allowFontScaling={props.allowFontScaling} maxFontSizeMultiplier={props.maxFontSizeMultiplier} style={[local.placeholder, { color: hint }, placeholderStyle]}>{placeholder}</NativeText>
    </View>}
  </View>;
}
/**
 * Labelled input with the A2 TextField look (56 tall, outline-strong, 2dp primary focus, inline error).
 * A2's TextField has no testID or TextInput passthrough (keyboardType, autoComplete, editable…), which
 * auth and settings need, so this stays local until it does.
 */
export function Field({ label, leading, error, style, onFocus, onBlur, ...props }: TextInputProps & { label: string; leading?: IconName; error?: string }) {
  const { styles } = useLegacy();
  const { color } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const secure = !!props.secureTextEntry;
  const multiline = !!props.multiline;
  return <View style={styles.field}>
    <NativeText style={styles.label}>{label}</NativeText>
    <View style={[local.frame, { borderColor: error ? color.negative : focused ? color.primary : color.outlineStrong, borderWidth: focused || error ? 2 : 1, backgroundColor: props.editable === false ? color.surfaceSunken : 'transparent' }, multiline && { alignItems: 'flex-start' }]}>
      {leading ? <Icon name={leading} size={20} color="text2" /> : null}
      <PlaceholderInput accessibilityLabel={label} {...props} secureTextEntry={secure && !revealed}
        onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
        style={[styles.input, local.bare, style, { color: props.editable === false ? color.text2 : color.text }]} wrapperStyle={{ flex: 1 }} />
      {secure ? <Pressable accessibilityRole="button" accessibilityLabel={revealed ? "Hide password" : "Show password"} hitSlop={4} onPress={() => setRevealed(value => !value)} style={local.eye}>
        <Icon name={revealed ? { ios: "eye.slash", android: "visibility_off" } : { ios: "eye", android: "visibility" }} size={22} color="text2" />
      </Pressable> : null}
    </View>
    {error ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name={{ ios: "exclamationmark.circle", android: "error" }} size={16} color="negative" /><Text variant="caption" tone="negative" style={{ flexShrink: 1 }}>{error}</Text></View> : null}
  </View>;
}
export function ErrorBox({ message }: { message: string }) {
  const bannerVisible = useContext(WorkspaceBannerVisible);
  const { color, radius } = useTheme();
  return message && !bannerVisible ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: radius.m, backgroundColor: color.negativeContainer }}>
    <Icon name={{ ios: "exclamationmark.circle", android: "error" }} size={20} color="negative" />
    <Text tone="negative" style={{ flex: 1 }}>{message}</Text>
  </View> : null;
}
/** A2 Button with a Maestro testID on a non-collapsing wrapper (A2's Button has no testID prop). */
export function Button({ title, onPress, disabled = false, testID, write = false, variant = "filled", loading = false, icon, fullWidth = true }: { title: string; onPress: () => void; disabled?: boolean; testID?: string; write?: boolean; variant?: "filled" | "tonal" | "outline" | "text" | "danger-text"; loading?: boolean; icon?: IconName; fullWidth?: boolean }) {
  const offline = useOffline();
  disabled = disabled || (write && offline);
  return <View testID={testID} collapsable={false} accessibilityHint={write && offline ? "You're offline. Reconnect before making changes." : undefined}>
    <UiButton label={title} onPress={onPress} disabled={disabled} variant={variant} loading={loading} icon={icon} fullWidth={fullWidth} />
  </View>;
}
export function BrandTile({ size = 48 }: { size?: number }) {
  return <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={require("../../assets/spndrr-mark.png")} resizeMode="contain" style={{ width: size, height: size }} />;
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
  const go = () => router.push(open ? "/(auth)/signup" : "/(auth)/request-access");
  if (outlined) return <Button variant="outline" title={open ? "Create a new account" : "Request MVP access"} onPress={go} />;
  return <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: 6 }}>
    <Text tone="text2">{open ? "New here?" : "Not on the beta yet?"}</Text>
    <AuthLink title={open ? "Create an account" : "Request MVP access"} onPress={go} />
  </View>;
}
function AuthLink({ title, onPress, expanded }: { title: string; onPress: () => void; expanded?: boolean }) {
  return <Pressable accessibilityRole="link" accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress} style={{ minHeight: 48, minWidth: 48, justifyContent: "center" }}>
    <Text variant="label" tone="primaryText">{title}</Text>
  </Pressable>;
}
/** Auth backdrop: `gradient.authBackdrop` plus a faint Slice shape, behind the mark, headline and promise. */
export function AuthBackdrop({ headline, promise, children }: { headline: string; promise: string; children: React.ReactNode }) {
  const s = useThemedStyles(makeAuthStyles);
  const { gradient, color } = useTheme();
  const { colors: stops, locations } = gradient.authBackdrop;
  const backdrop = `linear-gradient(180deg, ${stops.map((c, index) => `${c} ${Math.round((locations[index] ?? 1) * 100)}%`).join(", ")})`;
  return <View style={[s.root, { backgroundImage: backdrop }]}>
    <View pointerEvents="none" style={[s.slice, { backgroundColor: withAlpha(color.primary, 0.08) }]} />
    <View pointerEvents="none" style={[s.sliceCut, { backgroundColor: withAlpha(color.primary, 0.06) }]} />
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
      <AndroidKeyboardFrame>
        <ScrollView automaticallyAdjustKeyboardInsets={Platform.OS === "ios"} keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
          <View style={s.hero}>
            <View style={s.brand}><BrandTile size={56} /><Text variant="headline">Spndrr</Text></View>
            <Text variant="display" accessibilityRole="header">{headline}</Text>
            <Text variant="bodyL" tone="text2">{promise}</Text>
          </View>
          <SafeAreaView edges={["bottom"]} style={s.panel}>{children}</SafeAreaView>
        </ScrollView>
      </AndroidKeyboardFrame>
    </SafeAreaView>
  </View>;
}
const makeAuthStyles = (t: ThemeValue) => ({
  root: { flex: 1, backgroundColor: t.color.bg, overflow: "hidden" } as ViewStyle,
  slice: { position: "absolute", width: 320, height: 320, borderRadius: 160, top: 40, right: -110 } as ViewStyle,
  sliceCut: { position: "absolute", width: 150, height: 160, borderTopRightRadius: 150, top: 40, right: -10 } as ViewStyle,
  scroll: { flexGrow: 1, justifyContent: "space-between" } as ViewStyle,
  hero: { paddingHorizontal: t.layout.gutter + 4, paddingTop: 32, paddingBottom: 32, gap: 16 } as ViewStyle,
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 } as ViewStyle,
  panel: { backgroundColor: t.color.surface, borderTopLeftRadius: t.radius.xl, borderTopRightRadius: t.radius.xl, paddingHorizontal: t.layout.gutter + 4, paddingTop: 28, paddingBottom: 16, gap: 16, ...t.elevation.sheet } as ViewStyle,
});
function InvitationLinkForm() {
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return <View style={{ gap: 16, paddingTop: 8 }}>
    <AuthLink title="Already approved? Open your invitation" expanded={expanded} onPress={() => setExpanded(!expanded)} />
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
  const { color } = useTheme();
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
  const headline = request ? "Get early access." : signup ? "Start tracking in plain words." : "Know where every rupee goes.";
  const promise = request ? "Spndrr is available by approval while in beta. Tell us a little about yourself." : signup ? "Type what you spent the way you’d text a friend. Spndrr does the sorting." : "Type what you spent. Spndrr sorts it, charts it and tells you when something drifts.";
  return <View testID={mode === "login" ? "login-screen" : undefined} style={{ flex: 1 }}>
    <AuthBackdrop headline={headline} promise={promise}>
      <Text variant="headline">{request ? "Request MVP access" : signup ? "Create your account" : "Welcome back"}</Text>
      {sent ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 8, padding: 16, borderRadius: 16, backgroundColor: color.primaryContainer }}><Icon name={{ ios: "checkmark.circle", android: "check_circle" }} size={20} color="onPrimaryContainer" /><Text style={{ flex: 1, color: color.onPrimaryContainer }}>Your request has been received. We’ll email you if access is approved.</Text></View> : <>
        {mode !== "login" && <Field label="Name" leading={{ ios: "person", android: "person" }} placeholder="Aarav Shah" maxLength={128} value={displayName} onChangeText={setDisplayName} autoComplete="name" textContentType="name" editable={!locks.displayName} />}
        <Field label="Email" leading={{ ios: "envelope", android: "mail" }} testID={mode === "login" ? "login-email" : undefined} placeholder="name@example.com" maxLength={256} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!locks.email} />
        {!request && <Field label="Password" leading={{ ios: "lock", android: "lock" }} testID={mode === "login" ? "login-password" : undefined} placeholder="At least 8 characters" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={signup ? "new-password" : "current-password"} textContentType={signup ? "newPassword" : "password"} />}
        {request && <>
          <Field label="Why would you like access? (optional)" value={reason} onChangeText={setReason} maxLength={1000} multiline style={{ minHeight: 96, textAlignVertical: "top" }} />
          <Text tone="text2">We’ll use these details to review your request and contact you about access.</Text>
        </>}
        {signup && <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept beta privacy policy" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)} style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 48 }}>
          <Icon name={accepted ? { ios: "checkmark.square.fill", android: "check_box" } : { ios: "square", android: "check_box_outline_blank" }} size={24} color={accepted ? "primaryText" : "text2"} />
          <Text tone="text2" style={{ flex: 1 }}>I accept the beta privacy policy (version 2026-07-26-ai-planning.1).</Text>
        </Pressable>}
        <ErrorBox message={error} />
        <Button disabled={busy} loading={busy} testID={mode === "login" ? "login-submit" : undefined} title={request ? "Request MVP access" : signup ? "Create account" : "Sign in"} onPress={() => { void submit(); }} />
      </>}
      {mode === "login" ? <RegistrationLink /> : <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: 6 }}><Text tone="text2">Have an account?</Text><Link asChild href="/(auth)/login"><Pressable accessibilityRole="link" style={{ minHeight: 48, justifyContent: "center" }}><Text variant="label" tone="primaryText">Sign in</Text></Pressable></Link></View>}
      {request ? <InvitationLinkForm /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: 4 }}>
        <Text variant="caption" tone="text2">By continuing you agree to the</Text>
        <Pressable accessibilityRole="link" onPress={openPolicy} style={{ minHeight: 48, justifyContent: "center" }}><Text variant="caption" tone="primaryText" style={{ fontWeight: "600" }}>privacy policy</Text></Pressable>
      </View>
    </AuthBackdrop>
    <PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} />
  </View>;
}
const local = StyleSheet.create({
  placeholderOverlay: { position: "absolute", top: 12, left: 13, right: 13 },
  placeholder: { fontSize: 16 },
  frame: { minHeight: 56, borderRadius: 12, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, gap: 12 },
  bare: { flex: 1, borderWidth: 0, backgroundColor: "transparent", minHeight: 52, paddingHorizontal: 0 },
  eye: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
});
