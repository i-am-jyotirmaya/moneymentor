import { useRouter } from "expo-router";
import { useContext, useEffect, useState } from "react";
import { AccessibilityInfo, Keyboard, Platform, Pressable, StyleSheet, Text as NativeText, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { ApiError } from "../api/client";
import { registrationIsOpen } from "../auth/registration";
import { useSession } from "../auth/session";
import { authFieldLocks, validateAuthForm } from "../auth/validation";
import { invitationToken } from "../lib/deep-links";
import { WorkspaceBannerVisible } from "../workspace/banner";
import { useOffline } from "../workspace/connection";
import { useLegacy } from "../workspace/legacy-styles";
import { AuthFrame } from "./AuthFrame";
import { AuthPrimary } from "./AuthVisuals";
import { Button as UiButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { dur, ease } from "./motion";
import { PrivacyPolicySheet } from "./PrivacyPolicySheet";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";

export type Invitation = { token: string; name: string; email: string };
type PlaceholderInputProps = TextInputProps & {
  wrapperStyle?: StyleProp<ViewStyle>;
  placeholderStyle?: StyleProp<TextStyle>;
  placeholderOverlayStyle?: StyleProp<ViewStyle>;
};
/** Multiline fields keep typing/wrapping normally, but the empty hint stays on one line. */
export function PlaceholderInput({ placeholder, placeholderTextColor, multiline, wrapperStyle, placeholderStyle, placeholderOverlayStyle, accessibilityHint, ...props }: PlaceholderInputProps) {
  const { color } = useTheme();
  const hint = placeholderTextColor ?? color.text3;
  // Native single-line inputs already truncate their placeholder. Only controlled multiline inputs need the overlay.
  if (!multiline || !placeholder || typeof props.value !== "string") {
    return <TextInput {...props} multiline={multiline} placeholder={placeholder} placeholderTextColor={hint} accessibilityHint={accessibilityHint} />;
  }
  return <View style={[{ minWidth: 0 }, wrapperStyle]}>
    <TextInput {...props} multiline accessibilityHint={accessibilityHint ?? placeholder} />
    {!props.value && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[local.placeholderOverlay, placeholderOverlayStyle]}>
      <NativeText numberOfLines={1} ellipsizeMode="tail" allowFontScaling={props.allowFontScaling} maxFontSizeMultiplier={props.maxFontSizeMultiplier} style={[local.placeholder, { color: hint }, placeholderStyle]}>{placeholder}</NativeText>
    </View>}
  </View>;
}
/**
 * Labelled input with the A2 TextField look (56 tall, outline-strong, 2dp primary focus, inline error).
 * A2's TextField has no testID or TextInput passthrough (keyboardType, autoComplete, editable…), which
 * auth and settings need, so this stays local until it does.
 */
export function Field({ label, leading, error, auth = false, optional = false, style, onFocus, onBlur, ...props }: TextInputProps & {
  label: string; leading?: IconName; error?: string; auth?: boolean; optional?: boolean;
}) {
  const { styles } = useLegacy();
  const { color } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const secure = !!props.secureTextEntry;
  const multiline = !!props.multiline;
  const locked = props.editable === false;
  const outlined = focused || !!error;
  const focusColor = auth ? color.primaryText : color.primary;
  const borderColor = error ? color.negative : focused ? focusColor : color.outlineStrong;
  const backgroundColor = locked || auth ? color.surfaceSunken : "transparent";
  return <View style={auth ? local.authField : styles.field}>
    {auth ? <View style={local.fieldHeading}>
      <Text variant="label" style={local.fieldLabel}>{label}</Text>
      {optional && <Text variant="caption" tone="text2">Optional</Text>}
    </View> : <NativeText style={styles.label}>{label}</NativeText>}
    <View style={[local.frame, auth && local.authFrame, { borderColor, borderWidth: outlined ? 2 : 1, backgroundColor }, multiline && local.multiline]}>
      {leading ? <Icon name={leading} size={20} color="text2" /> : null}
      <PlaceholderInput accessibilityLabel={optional ? `${label} (optional)` : label} {...props}
        accessibilityState={locked ? { disabled: true } : props.accessibilityState}
        secureTextEntry={secure && !revealed}
        onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
        style={[styles.input, local.bare, auth && local.authInput, style, { color: locked ? color.text2 : color.text }]} wrapperStyle={local.fill} />
      {secure && <Pressable accessibilityRole="button" accessibilityLabel={revealed ? "Hide password" : "Show password"}
        hitSlop={4} onPress={() => setRevealed(value => !value)} style={[local.eye, auth && local.authEye]}>
        {auth ? <Text variant="caption" tone="primaryText">{revealed ? "Hide" : "Show"}</Text> :
          <Icon name={revealed ? { ios: "eye.slash", android: "visibility_off" } : { ios: "eye", android: "visibility" }} size={22} color="text2" />}
      </Pressable>}
    </View>
    {error ? <View accessibilityLiveRegion="polite" style={local.inlineError}><Icon name={{ ios: "exclamationmark.circle", android: "error" }} size={16} color="negative" /><Text variant="caption" tone="negative" style={local.shrink}>{error}</Text></View> : null}
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
export function useRegistrationDestination() {
  const { client } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void registrationIsOpen(client).then(value => { if (active) setOpen(value); });
    return () => { active = false; };
  }, [client]);
  return { open, href: open ? "/(auth)/signup" : "/(auth)/request-access" } as const;
}

function RegistrationLink() {
  const router = useRouter();
  const { open, href } = useRegistrationDestination();
  return <View style={local.switchRow}>
    <Text variant="caption" tone="text2">New to Spndrr?</Text>
    <AuthLink title={open ? "Create an account" : "Request MVP access"} onPress={() => router.push(href)} />
  </View>;
}

export function AuthLink({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [local.link, pressed && local.pressed]}>
    <Text variant="label" tone="primaryText">{title}</Text>
  </Pressable>;
}

const reveal = FadeIn.duration(dur.base).easing(ease.decelerate).reduceMotion(ReduceMotion.System);

function InvitationLinkForm() {
  const [expanded, setExpanded] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { color } = useTheme();

  function openInvitation() {
    const token = invitationToken(link);
    if (!token) { setError("Paste the complete approved signup link from your Spndrr email."); return; }
    Keyboard.dismiss();
    router.push({ pathname: "/(auth)/signup", params: { token } });
  }

  return <View style={[local.invitation, { borderColor: color.outline }]}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={({ pressed }) => [local.disclosure, pressed && local.pressed]}>
      <Icon name={expanded ? { ios: "chevron.down", android: "expand_more" } : { ios: "chevron.forward", android: "chevron_right" }}
        size={15} color="primaryText" />
      <Text variant="caption" tone="primaryText" style={local.shrink}>Already approved? Open your invitation</Text>
    </Pressable>
    {expanded && <Animated.View entering={reveal} style={local.invitationContent}>
      <Field auth label="Signup link" placeholder="Paste your signup link" value={link}
        onChangeText={value => { setLink(value); setError(""); }} error={error}
        autoComplete="off" autoCapitalize="none" autoCorrect={false} keyboardType="url"
        returnKeyType="go" onSubmitEditing={openInvitation} />
      <Button title="Open invitation" variant="outline" onPress={openInvitation} />
    </Animated.View>}
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
  useEffect(() => {
    if (sent && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility("Request received. If you’re approved, we’ll email you a signup link.");
  }, [sent]);
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
  const title = sent ? "Request\nreceived." : request ? "Request\nMVP access." : signup ? "Create your\naccount." : "Welcome\nback.";
  const intro = request ? "Tell us a little about yourself. If you’re approved, we’ll email you a signup link."
    : signup ? (invitation ? "Your invitation is ready. Set up your account to start tracking." : "Set up your account to start tracking.")
    : "Sign in to pick up where you left off.";
  const existingAccount = <View style={local.switchRow}>
    <Text variant="caption" tone="text2">Have an account?</Text>
    <AuthLink title="Sign in" onPress={() => router.navigate("/(auth)/login")} />
  </View>;

  return <AuthFrame testID={mode === "login" ? "login-screen" : undefined} title={title} expandedHero={mode === "login"}>
    {sent ? (
      <Animated.View entering={reveal} accessibilityLiveRegion="polite" style={local.confirmation}>
        <Icon name={{ ios: "checkmark.circle.fill", android: "check_circle" }} size={44} color="primaryText" />
        <Text variant="headline">We’ll be in touch.</Text>
        <Text tone="text2">If you’re approved, look for a signup link in your email.</Text>
        <AuthPrimary label="Back to welcome" onPress={() => router.dismissTo("/")} />
      </Animated.View>
    ) : (
      <>
        <Text tone="text2" style={local.intro}>{intro}</Text>

        {mode !== "login" && <Field auth label="Full name" placeholder="e.g. Aarav Shah" maxLength={128}
          value={displayName} onChangeText={setDisplayName} autoComplete="name" textContentType="name" />}
        <Field auth label={locks.email ? "Invited email" : "Email address"} testID={mode === "login" ? "login-email" : undefined}
          placeholder="you@example.com" maxLength={256} value={email} onChangeText={setEmail} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} spellCheck={false} autoComplete={mode === "login" ? "username" : "email"}
          textContentType={mode === "login" ? "username" : "emailAddress"} editable={!locks.email} />
        {locks.email && <Text variant="caption" tone="text2" style={local.associatedHint}>This email is linked to your invitation.</Text>}

        {request ? <>
          <Field auth optional label="What would you like to track?" placeholder="e.g. Everyday spending"
            value={reason} onChangeText={setReason} maxLength={1000} multiline style={local.reason} />
          <Text variant="caption" tone="text2">We’ll use these details to review your request and contact you about access.</Text>
        </> : <Field auth label="Password" testID={mode === "login" ? "login-password" : undefined}
          placeholder={signup ? "At least 8 characters" : "Enter your password"} value={password} onChangeText={setPassword}
          secureTextEntry autoCapitalize="none" autoCorrect={false} spellCheck={false}
          autoComplete={signup ? "new-password" : "current-password"} textContentType={signup ? "newPassword" : "password"}
          returnKeyType={signup ? "done" : "go"} onSubmitEditing={signup ? undefined : () => { void submit(); }} />}
        {signup && <View style={local.policyRow}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Accept beta privacy policy" accessibilityState={{ checked: accepted }}
            onPress={() => setAccepted(value => !value)} style={({ pressed }) => [local.check, pressed && local.pressed]}>
            <Icon name={accepted ? { ios: "checkmark.square.fill", android: "check_box" } : { ios: "square", android: "check_box_outline_blank" }}
              size={22} color={accepted ? "primaryText" : "text2"} />
            <Text variant="caption" tone="text2" style={local.shrink}>I accept the beta privacy policy.</Text>
          </Pressable>
          <AuthLink title="Read policy" onPress={openPolicy} />
        </View>}

        <ErrorBox message={error} />
        <AuthPrimary loading={busy} testID={mode === "login" ? "login-submit" : undefined}
          label={request ? "Send access request" : signup ? "Create account" : "Sign in"} onPress={() => { void submit(); }} />

        {request && <InvitationLinkForm />}
        {mode === "login" && <RegistrationLink />}
        <View style={[local.footer, request && local.requestFooter]}>
          {mode !== "login" && existingAccount}
          {!signup && <AuthLink title="Privacy policy" onPress={openPolicy} />}
        </View>
      </>
    )}
    <PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} />
  </AuthFrame>;
}

const local = StyleSheet.create({
  fill: { flex: 1 },
  shrink: { flexShrink: 1 },
  placeholderOverlay: { position: "absolute", top: 12, left: 13, right: 13 },
  placeholder: { fontSize: 16 },
  frame: { minHeight: 56, borderRadius: 12, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, gap: 12 },
  bare: { flex: 1, borderWidth: 0, backgroundColor: "transparent", minHeight: 52, paddingHorizontal: 0 },
  authField: { gap: 5 },
  authFrame: { minHeight: 48, paddingStart: 12, paddingEnd: 8, gap: 4 },
  authInput: { minHeight: 46, paddingVertical: 8 },
  fieldHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  fieldLabel: { flexShrink: 1 },
  multiline: { alignItems: "flex-start" },
  eye: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  authEye: { height: 44 },
  inlineError: { flexDirection: "row", alignItems: "center", gap: 6 },
  intro: { maxWidth: 340, marginBottom: 3 },
  reason: { minHeight: 60, textAlignVertical: "top" },
  associatedHint: { marginTop: -7 },
  link: { minHeight: 48, minWidth: 48, justifyContent: "center" },
  pressed: { opacity: 0.72 },
  switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 6 },
  policyRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", columnGap: 8 },
  check: { minHeight: 48, flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  footer: { marginTop: "auto", alignItems: "center" },
  requestFooter: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", columnGap: 6 },
  invitation: { borderBottomWidth: StyleSheet.hairlineWidth },
  disclosure: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 5 },
  invitationContent: { paddingBottom: 12, gap: 10 },
  confirmation: { gap: 14 },
});
