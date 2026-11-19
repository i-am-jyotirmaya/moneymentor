import { useEffect, useRef, useState } from 'react';
import { TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { isLoaded } from 'expo-font';
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { spokenInr } from '../lib/format';
import { formatInrWorklet, type CountUpSign } from './countUpFormat';
import { dur, timing } from './motion';
import { Text, defaultMaxFontSizeMultiplier, textStyleFor, type TextTone, type TextVariant } from './Text';
import { useTheme } from './ThemeProvider';

export { inrWorklet } from './countUpFormat';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function CountUp({ value, from = 0, format, duration = dur.countUp, variant = 'numberL',
  tone = 'text', sign = 'auto', delay = 0, accessibilityLabel, style, testID }: {
  value: number; from?: number; format?: (value: number) => string; duration?: number;
  variant?: TextVariant; tone?: TextTone; sign?: CountUpSign; delay?: number; accessibilityLabel?: string; style?: StyleProp<TextStyle>; testID?: string;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(reduced ? value : from);
  const opacity = useSharedValue(1);
  const previous = useRef<{ from: number; value: number } | undefined>(undefined);
  const [initial] = useState(() => format ? format(reduced ? value : from) : formatInrWorklet(reduced ? value : from, sign));
  const final = format ? format(value) : formatInrWorklet(value, sign);
  const spoken = accessibilityLabel ?? (format ? final : spokenInr(Math.sign(value) * Math.round(Math.abs(value)), { sign }));
  const { fontFamily, ...typography } = textStyleFor(theme, variant, tone, true);

  useEffect(() => {
    const last = previous.current;
    previous.current = { from, value };
    if (reduced) {
      progress.value = value;
      opacity.value = 1;
    } else if (!last || last.from !== from) {
      opacity.value = 1;
      progress.value = from;
      const animation = withTiming(value, { ...timing('countUp', 'decelerate'), duration });
      progress.value = delay ? withDelay(delay, animation, timing('countUp').reduceMotion) : animation;
    } else if (last.value !== value) {
      progress.value = value;
      opacity.value = 0;
      opacity.value = withTiming(1, timing('fast'));
    }
  }, [delay, duration, from, opacity, progress, reduced, value]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const animatedProps = useAnimatedProps(() => ({
    text: format ? format(progress.value) : formatInrWorklet(progress.value, sign),
  } as { text: string } & Partial<React.ComponentProps<typeof TextInput>>));

  return (
    <View testID={testID} style={{ alignSelf: 'flex-start', minWidth: width }}>
      <Text numeric variant={variant} tone={tone} importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden pointerEvents="none"
        style={[style, { opacity: 0, alignSelf: 'flex-start' }]} onLayout={event => setWidth(event.nativeEvent.layout.width)}>{final}</Text>
      {reduced ? (
        <Text numeric variant={variant} tone={tone} accessibilityLabel={spoken} accessibilityLiveRegion="none"
          style={[{ position: 'absolute', inset: 0 }, style]}>{final}</Text>
      ) : (
        <AnimatedTextInput editable={false} caretHidden defaultValue={initial} animatedProps={animatedProps}
          accessibilityLabel={spoken} accessibilityLiveRegion="none"
          maxFontSizeMultiplier={defaultMaxFontSizeMultiplier(variant)}
          style={[typography, fontFamily && isLoaded(fontFamily) ? { fontFamily } : undefined,
            { padding: 0, position: 'absolute', inset: 0 }, animatedStyle, style]} />
      )}
    </View>
  );
}
