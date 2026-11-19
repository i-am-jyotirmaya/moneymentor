import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';
import Animated, { FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import type { FeedbackAction } from './EmptyState';
import { Icon, type IconName } from './Icon';
import { timing } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

type ToastTone = 'info' | 'income' | 'negative' | 'warning';
type ToastMessage = { message: string; action?: FeedbackAction; tone?: ToastTone };

const toneIcon: Record<ToastTone, IconName> = {
  info: { ios: 'info.circle', android: 'info' },
  income: { ios: 'checkmark.circle', android: 'check_circle' },
  negative: { ios: 'exclamationmark.circle', android: 'error' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
};

const ToastContext = createContext<{ show: (toast: ToastMessage) => void } | null>(null);

export function toastDuration(hasAction: boolean) {
  return hasAction ? 6000 : 4000;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast requires a ToastProvider.');
  return context;
}

function Toast({ message, action, tone, bottomOffset, dismiss }: ToastMessage & {
  bottomOffset: number; dismiss: () => void;
}) {
  const { color, radius, space, elevation } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const offset = useSharedValue(reduced ? 0 : 16);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(toastDuration(Boolean(action)));
  useEffect(() => {
    opacity.value = withTiming(1, timing('base', 'decelerate'));
    offset.value = withTiming(0, timing('base', 'decelerate'));
  }, [offset, opacity]);

  useEffect(() => {
    if (touched || focused) return;
    const started = Date.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [dismiss, focused, touched]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, { dx, dy }) => dy > 12 && dy > Math.abs(dx),
    onPanResponderRelease: (_, { dy }) => {
      setTouched(false);
      if (dy >= 32) dismiss();
    },
    onPanResponderTerminate: () => setTouched(false),
  }), [dismiss]);
  const enter = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: offset.value }] }));
  const exit = timing('fast', 'accelerate');

  return (
    <Animated.View style={[elevation.level2, { position: 'absolute', left: space.s5, right: space.s5,
      bottom: bottomOffset + space.s5, backgroundColor: color.text, borderRadius: radius.m }, enter]}
      exiting={FadeOut.duration(exit.duration).easing(exit.easing).reduceMotion(exit.reduceMotion)}
      onTouchStart={() => setTouched(true)} onTouchEnd={() => setTouched(false)} onTouchCancel={() => setTouched(false)}
      {...pan.panHandlers}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.s3,
        minHeight: 48, paddingHorizontal: space.s4, paddingVertical: space.s2 }}>
        {tone && <Icon name={toneIcon[tone]} color="bg" size={20} />}
        <Text accessible accessibilityLiveRegion="polite"
          accessibilityActions={[{ name: 'dismiss', label: 'Dismiss' }]}
          onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'dismiss') dismiss(); }}
          style={{ color: color.bg, flexGrow: 1, flexShrink: 1 }}>{message}</Text>
        {action && (
          <PressableScale layer="none" accessibilityRole="button" accessibilityLabel={action.label}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onPress={() => { dismiss(); action.onPress(); }} contentStyle={{ paddingHorizontal: space.s3 }}>
            <Text variant="label" style={{ color: color.bg, textDecorationLine: 'underline' }}>{action.label}</Text>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}

export function ToastProvider({ children, bottomOffset }: { children: ReactNode; bottomOffset: number }) {
  const [toast, setToast] = useState<{ id: number; content: ToastMessage }>();
  const sequence = useRef(0);
  const show = useCallback((content: ToastMessage) => setToast({ id: ++sequence.current, content }), []);
  const id = toast?.id;
  const dismiss = useCallback(() => setToast(current => current?.id === id ? undefined : current), [id]);
  const context = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={context}>
      <View style={{ flex: 1 }}>
        {children}
        {toast && <Toast key={toast.id} {...toast.content} bottomOffset={bottomOffset} dismiss={dismiss} />}
      </View>
    </ToastContext.Provider>
  );
}
