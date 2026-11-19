import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeOut, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { Card } from './Card';
import { withAlpha } from './color';
import { timing, dur } from './motion';
import { useTheme } from './ThemeProvider';

const Shimmer = createContext<SharedValue<number> | null>(null);

export function SkeletonGroup({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(withTiming(1, timing('shimmer', 'linear')), -1, false, undefined, timing('shimmer').reduceMotion);
    return () => cancelAnimation(progress);
  }, [progress, reduced]);
  const exit = timing('fast', 'accelerate');
  return (
    <Animated.View exiting={reduced ? undefined : FadeOut.duration(exit.duration).easing(exit.easing).reduceMotion(exit.reduceMotion)}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Shimmer.Provider value={reduced ? null : progress}>{children}</Shimmer.Provider>
    </Animated.View>
  );
}

export function SkeletonBlock({ width, height, radius }: {
  width: ViewStyle['width']; height: number; radius?: number;
}) {
  const theme = useTheme();
  const progress = useContext(Shimmer);
  const [measured, setMeasured] = useState(0);
  const band = measured * 0.3;
  const shimmer = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress?.value ?? 0) * (measured + band) - band }],
  }));
  return (
    <View onLayout={event => setMeasured(event.nativeEvent.layout.width)}
      style={{ width, height, borderRadius: radius ?? theme.radius.xs, overflow: 'hidden',
        backgroundColor: withAlpha(theme.color.text, theme.scheme === 'dark' ? 0.06 : 0.07) }}>
      {progress && <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: band,
        backgroundColor: withAlpha(theme.color.surface, 0.6) }, shimmer]} />}
    </View>
  );
}

export function Skeleton({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  const { space } = useTheme();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), dur.fast);
    return () => clearTimeout(timeout);
  }, []);
  const blocks = (
    <Card padding={space.s5}>
      <View style={{ gap: space.s4 }}>
        <SkeletonBlock width="48%" height={20} />
        <SkeletonBlock width="78%" height={12} />
        <SkeletonBlock width="100%" height={12} />
        <SkeletonBlock width="64%" height={12} />
      </View>
    </Card>
  );
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}
      style={[{ padding: space.s5, width: '100%' }, style]}>
      {visible ? <SkeletonGroup>{blocks}</SkeletonGroup>
        : <View style={{ opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{blocks}</View>}
    </View>
  );
}
