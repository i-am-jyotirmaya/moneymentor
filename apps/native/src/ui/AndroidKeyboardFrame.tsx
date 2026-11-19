import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Only account for the portion of the measured viewport still behind the IME. */
export function remainingKeyboardOverlap(viewportY: number, viewportHeight: number, keyboardTop: number | null) {
  if (keyboardTop === null || ![viewportY, viewportHeight, keyboardTop].every(Number.isFinite) || viewportHeight <= 0) return 0;
  const overlap = Math.min(viewportHeight, Math.max(0, viewportY + viewportHeight - keyboardTop));
  return overlap <= 1 ? 0 : overlap; // Ignore sub-dp native measurement jitter.
}

/**
 * Native adjustResize is the first line of defense. Edge-to-edge Android may still leave
 * the React viewport behind the IME, so measure its actual bottom against the keyboard top.
 * Measuring the outer, unpadded frame prevents a feedback loop or double-resizing.
 */
export function AndroidKeyboardFrame({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const viewport = useRef<ComponentRef<typeof View>>(null);
  const keyboardTop = useRef<number | null>(null);
  const pending = useRef<number | null>(null);
  const generation = useRef(0);
  const [overlap, setOverlap] = useState(0);

  const measure = useCallback(() => {
    if (Platform.OS !== 'android') return;
    const request = ++generation.current;
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      pending.current = null;
      if (keyboardTop.current === null) { setOverlap(0); return; }
      viewport.current?.measureInWindow((_x, y, _width, height) => {
        if (request !== generation.current) return;
        setOverlap(remainingKeyboardOverlap(y, height, keyboardTop.current));
      });
    });
  }, []);

  const cancelMeasurement = useCallback(() => {
    if (pending.current !== null) cancelAnimationFrame(pending.current);
    pending.current = null;
    generation.current++;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    keyboardTop.current = Keyboard.metrics()?.screenY ?? null;
    measure();
    const show = Keyboard.addListener('keyboardDidShow', event => {
      keyboardTop.current = event.endCoordinates.screenY;
      measure();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      measure();
    });
    return () => {
      show.remove(); hide.remove();
      cancelMeasurement();
    };
  }, [measure, cancelMeasurement]);

  // iOS uses either native ScrollView keyboard insets or a single KeyboardAvoidingView.
  if (Platform.OS !== 'android') return <View style={[local.fill, style]}>{children}</View>;
  return <View ref={viewport} collapsable={false} onLayout={measure} style={[local.fill, style]}>
    <View style={[local.fill, { paddingBottom: overlap }]}>{children}</View>
  </View>;
}
const local = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
