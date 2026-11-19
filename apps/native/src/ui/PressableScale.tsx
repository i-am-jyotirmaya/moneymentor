import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { withAlpha } from './color';
import { pressScale, spring, timing } from './motion';
import { useTheme } from './ThemeProvider';
import type { Theme } from './theme';

export type PressLayer = 'primary' | 'on-primary' | 'none';

export function pressLayerColor(theme: Theme, layer: PressLayer) {
  if (layer === 'none') return 'transparent';
  if (layer === 'on-primary') return withAlpha(theme.color.onPrimary, 0.12);
  return withAlpha(theme.color.primary, theme.scheme === 'dark' ? 0.14 : 0.1);
}

type Props = Omit<PressableProps, 'android_ripple' | 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: 0.97 | 0.92;
  layer?: PressLayer;
  /** When supplied, only this content scales. */
  scaleContent?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  pressedBackground?: string;
  stateLayerStyle?: StyleProp<ViewStyle>;
};

export function PressableScale({
  children, style, scaleTo = pressScale, layer = 'primary', scaleContent, contentStyle,
  pressedBackground, stateLayerStyle, onPressIn, onPressOut, ...props
}: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  const transform = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const overlay = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const setPressed = (pressed: boolean) => {
    scale.set(reduced ? 1 : withSpring(pressed ? scaleTo : 1, spring.press));
    opacity.set(withTiming(pressed ? 1 : 0, timing('instant')));
  };
  const stateStyle = [
    StyleSheet.absoluteFill,
    { borderRadius: StyleSheet.flatten(contentStyle)?.borderRadius },
    stateLayerStyle,
    overlay,
  ];

  return (
    <Pressable
      {...props}
      style={[{ minWidth: 48, minHeight: 48 }, style]}
      onPressIn={event => { setPressed(true); onPressIn?.(event); }}
      onPressOut={event => { setPressed(false); onPressOut?.(event); }}
    >
      <Animated.View style={[{ flexGrow: 1, justifyContent: 'center' }, contentStyle, scaleContent === undefined && transform]}>
        {pressedBackground && <Animated.View pointerEvents="none" style={[stateStyle, { backgroundColor: pressedBackground }]} />}
        {scaleContent !== undefined && <Animated.View style={transform}>{scaleContent}</Animated.View>}
        {children}
        {layer !== 'none' && <Animated.View pointerEvents="none" style={[
          stateStyle, { backgroundColor: pressLayerColor(theme, layer) },
        ]} />}
      </Animated.View>
    </Pressable>
  );
}
