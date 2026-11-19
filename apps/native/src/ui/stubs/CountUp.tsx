// TODO(A2): replace with A2 CountUp (same props).
import { useEffect } from 'react';
import { TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '../theme';
import { inrWorklet } from './inr';
import { textStyleFor, type TextTone, type TextVariant } from '../Text';
import { useTheme } from '../ThemeProvider';

export { inrWorklet };

const AnimatedInput = Animated.createAnimatedComponent(TextInput);
const [x1, y1, x2, y2] = motion.easing.decelerate;

export function CountUp({ value, from = 0, format = inrWorklet, duration = motion.duration.countUp, variant = 'numberL', tone = 'text', accessibilityLabel, style, testID }: {
  value: number; from?: number; format?: (v: number) => string; duration?: number; variant?: TextVariant; tone?: TextTone; accessibilityLabel?: string; style?: StyleProp<TextStyle>; testID?: string;
}) {
  const theme = useTheme();
  const current = useSharedValue(from);
  useEffect(() => {
    current.value = withTiming(value, { duration, easing: Easing.bezier(x1, y1, x2, y2), reduceMotion: ReduceMotion.System });
  }, [value, duration, current]);
  const animatedProps = useAnimatedProps(() => ({ text: format(current.value), defaultValue: format(current.value) }) as object);
  const { fontFamily, ...typography } = textStyleFor(theme, variant, tone, true);
  return <AnimatedInput testID={testID} editable={false} underlineColorAndroid="transparent" accessibilityLabel={accessibilityLabel ?? format(value)}
    maxFontSizeMultiplier={1.5} animatedProps={animatedProps} defaultValue={format(value)}
    style={[typography, { fontFamily, padding: 0, margin: 0 }, style]} />;
}
