// TODO(A2): replace with A2 PressableScale.
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '../theme';
import { useTheme } from '../ThemeProvider';

const press = { ...motion.spring.press, reduceMotion: ReduceMotion.System };

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  scaleTo?: 0.97 | 0.92;
  layer?: 'primary' | 'on-primary' | 'none';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function PressableScale({ scaleTo = motion.pressScale, layer = 'primary', style, children, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const { color, scheme } = useTheme();
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);
  const layerColor = layer === 'on-primary' ? 'rgba(255,255,255,0.12)' : layer === 'primary' ? `${color.primary}${scheme === 'dark' ? '24' : '1A'}` : 'transparent';
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const overlay = useAnimatedStyle(() => ({ opacity: pressed.value }));
  return <Pressable {...rest}
    onPressIn={event => { scale.set(withSpring(scaleTo, press)); pressed.set(1); onPressIn?.(event); }}
    onPressOut={event => { scale.set(withSpring(1, press)); pressed.set(0); onPressOut?.(event); }}>
    <Animated.View style={[style, animated, { overflow: 'hidden' }]}>
      {children}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: layerColor }, overlay]} />
    </Animated.View>
  </Pressable>;
}
