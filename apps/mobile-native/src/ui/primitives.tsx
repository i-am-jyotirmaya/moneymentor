import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { color, motion } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function Button({ title, onPress, disabled, loading, secondary, testID }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean; testID?: string;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    testID={testID} disabled={disabled || loading} onPress={onPress}
    onPressIn={() => { scale.value = withSpring(0.975, { ...motion.spring, reduceMotion: ReduceMotion.System }); }}
    onPressOut={() => { scale.value = withSpring(1, { ...motion.spring, reduceMotion: ReduceMotion.System }); }}
    style={[styles.button, secondary && styles.secondary, (disabled || loading) && styles.disabled, animated]}>
    {loading ? <ActivityIndicator color={secondary ? color.ink : color.surface} /> : null}
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </AnimatedPressable>;
}
export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={color.muted} {...props}
      style={[styles.input, props.multiline && { minHeight: 106, textAlignVertical: 'top' }, error && { borderColor: color.danger }, props.style]} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
export function Selection({ label, value, onPress, disabled, error }: { label: string; value: string; onPress: () => void; disabled?: boolean; error?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={[styles.selection, disabled && styles.disabled]}>
      <Text style={styles.body}>{value}</Text><Text accessible={false} style={styles.body}>›</Text>
    </Pressable>{error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</View>;
}
export function Card({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <View style={[styles.card, dark && { backgroundColor: color.ink, borderColor: color.ink }]}>{children}</View>;
}
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <View style={styles.notice}><Text accessibilityRole="alert" style={styles.error}>{message}</Text>
    {onRetry ? <Button title="Try again" onPress={onRetry} secondary /> : null}</View>;
}
export function Loading({ label = 'Loading your space…' }: { label?: string }) {
  return <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}><ActivityIndicator color={color.ink} /><Text style={styles.caption}>{label}</Text></View>;
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => subscription.remove();
  }, []);
  return reduced;
}
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  content: { padding: 22, gap: 18, width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: color.ink, letterSpacing: -1 },
  heading: { fontSize: 22, lineHeight: 29, fontWeight: '600', color: color.ink },
  body: { color: color.ink, fontSize: 16, lineHeight: 24, flexShrink: 1 },
  caption: { color: color.muted, fontSize: 14, lineHeight: 21 },
  label: { color: color.ink, fontSize: 14, lineHeight: 21, fontWeight: '600', marginBottom: 8 },
  field: { gap: 2 },
  input: { minHeight: 54, borderRadius: 16, borderWidth: 1, borderColor: color.border, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: color.surface, color: color.ink, fontSize: 17 },
  selection: { minHeight: 54, borderRadius: 16, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, padding: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  button: { minHeight: 52, borderRadius: 18, backgroundColor: color.ink, paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: color.surface, textAlign: 'center', flexShrink: 1 },
  secondary: { backgroundColor: color.tint }, secondaryText: { color: color.ink }, disabled: { opacity: 0.5 },
  card: { padding: 22, gap: 14, borderRadius: 26, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border },
  error: { color: color.danger, fontSize: 14, lineHeight: 21 },
  notice: { padding: 16, borderRadius: 16, backgroundColor: color.dangerTint, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16, backgroundColor: color.background },
});
