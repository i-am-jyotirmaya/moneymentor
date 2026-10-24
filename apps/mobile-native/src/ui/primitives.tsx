import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { AccessibilityInfo, ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme, motion, type Palette } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function KeyboardDismissButton() {
  const { color } = useTheme();
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  if (!visible) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel="Hide keyboard" testID="keyboard-dismiss" onPress={Keyboard.dismiss}
    style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: color.ink, fontSize: 16, fontWeight: '600' }}>Done</Text>
  </Pressable>;
}
export function Button({ title, onPress, disabled, loading, secondary, selected, testID, accessibilityLabel }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean; selected?: boolean; testID?: string; accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading, selected }}
    testID={testID} disabled={!!(disabled || loading)} onPress={onPress}
    onPressIn={() => { scale.set(withSpring(0.975, { ...motion.spring, reduceMotion: ReduceMotion.System })); }}
    onPressOut={() => { scale.set(withSpring(1, { ...motion.spring, reduceMotion: ReduceMotion.System })); }}
    style={[styles.button, secondary && styles.secondary, selected && styles.selected, (disabled || loading) && styles.disabled, animated]}>
    {loading ? <ActivityIndicator color={secondary ? color.ink : color.onAccent} /> : null}
    <Text style={[styles.buttonText, secondary && styles.secondaryText, selected && styles.selectedText]}>{title}</Text>
  </AnimatedPressable>;
}
export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string; ref?: Ref<TextInput> }) {
  const styles = useStyles();
  const { color, mode } = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={color.muted} selectionColor={color.accent} keyboardAppearance={mode} {...props}
      onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      style={[styles.input, focused && { borderColor: color.accent, boxShadow: `0 0 0 3px ${color.tint}` }, props.multiline && { minHeight: 106, textAlignVertical: 'top' }, error && { borderColor: color.danger }, props.style]} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
export function Selection({ label, value, onPress, disabled, error }: { label: string; value: string; onPress: () => void; disabled?: boolean; error?: string }) {
  const styles = useStyles();
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={[styles.selection, disabled && styles.disabled]}>
      <Text style={styles.body}>{value}</Text><Text accessible={false} style={styles.body}>›</Text>
    </Pressable>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}
export function Card({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  const styles = useStyles();
  const { color } = useTheme();
  return <View style={[styles.card, dark && { backgroundColor: color.hero, experimental_backgroundImage: `linear-gradient(135deg, ${color.hero}, ${color.heroEnd})` }]}>{children}</View>;
}
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useStyles();
  return <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{message}</Text>
    {onRetry ? <Button title="Try again" onPress={onRetry} secondary /> : null}</View>;
}
export function Loading({ label = 'Loading your space…' }: { label?: string }) {
  const styles = useStyles();
  const { color } = useTheme();
  return <View accessible style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}><ActivityIndicator color={color.ink} /><Text style={styles.caption}>{label}</Text></View>;
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduced;
}
const createStyles = (color: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 30, lineHeight: 37, fontWeight: '700', color: color.ink, letterSpacing: -0.8 },
  heading: { fontSize: 21, lineHeight: 28, fontWeight: '600', color: color.ink, letterSpacing: -0.4 },
  body: { color: color.ink, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  caption: { color: color.muted, fontSize: 13, lineHeight: 20 },
  label: { color: color.ink, fontSize: 13, lineHeight: 20, fontWeight: '600', marginBottom: 8 },
  field: { gap: 2 },
  input: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: color.border, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: color.surface, color: color.ink, fontSize: 16 },
  selection: { minHeight: 54, borderRadius: 18, backgroundColor: color.surface, padding: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12, boxShadow: `0 2px 12px ${color.shadow}` },
  button: { minHeight: 50, borderRadius: 18, backgroundColor: color.accent, experimental_backgroundImage: `linear-gradient(115deg, ${color.accent}, ${color.accentEnd})`, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: color.onAccent, textAlign: 'center', flexShrink: 1 },
  secondary: { backgroundColor: color.tint, experimental_backgroundImage: undefined }, secondaryText: { color: color.ink },
  selected: { backgroundColor: color.accent }, selectedText: { color: color.onAccent }, disabled: { opacity: 0.5 },
  card: { padding: 20, gap: 14, borderRadius: 24, backgroundColor: color.surface, boxShadow: `0 4px 20px ${color.shadow}` },
  error: { color: color.danger, fontSize: 14, lineHeight: 21 },
  notice: { padding: 16, borderRadius: 18, backgroundColor: color.dangerTint, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16, backgroundColor: color.background },
});
export function useStyles() {
  const { color } = useTheme();
  return useMemo(() => createStyles(color), [color]);
}
