import type { SymbolViewProps } from 'expo-symbols';
import { useLayoutEffect, useRef, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { layout, motion, radius, type } from '../ui/theme';
import { useTheme } from '../ui/ThemeProvider';
import { activeDockRoute, pillOffset, type DockRoute } from './navigation';
import { showNavLabels } from './section-state';
import { Icon } from './ui';

const springIndicator = { ...motion.spring.indicator, reduceMotion: ReduceMotion.System };
const dockGeometry = { inset: 12, tabGutter: 8, stretch: 4, labelHeight: 58, iconWidth: 64, iconHeight: 32 } as const;

export type NavDockRoute = { key: DockRoute; label: string; icon: SymbolViewProps['name'] };
export type NavDockProps = { routes: readonly NavDockRoute[]; active: string; moreOpen: boolean; onPress: (key: DockRoute) => void };

export function NavDock({ routes, active, moreOpen, onPress }: NavDockProps) {
  const { color, elevation, fontScale } = useTheme();
  const labels = showNavLabels(fontScale);
  const current = activeDockRoute(active, moreOpen);
  const index = Math.max(0, routes.findIndex(route => route.key === current));
  const [width, setWidth] = useState(0);
  const availableWidth = Math.max(0, width / routes.length - dockGeometry.tabGutter);
  const restingWidth = labels ? availableWidth : Math.min(availableWidth, dockGeometry.iconWidth);
  const height = labels ? dockGeometry.labelHeight : dockGeometry.iconHeight;
  const direction = I18nManager.isRTL ? -1 : 1;
  const x = useSharedValue(0);
  const pillWidth = useSharedValue(0);
  const placed = useRef<{ index: number; width: number; restingWidth: number } | null>(null);
  useLayoutEffect(() => {
    if (!width) return;
    const target = pillOffset(width, index, routes.length, 0);
    const last = placed.current;
    placed.current = { index, width, restingWidth };
    if (!last || last.width !== width || last.restingWidth !== restingWidth) {
      x.value = target;
      pillWidth.value = restingWidth;
      return;
    }
    if (last.index === index) return;
    x.value = withSpring(target, springIndicator);
    pillWidth.value = withSequence(
      withTiming(restingWidth + dockGeometry.stretch, { duration: motion.duration.instant, reduceMotion: ReduceMotion.System }),
      withSpring(restingWidth, springIndicator),
    );
  }, [index, width, routes.length, restingWidth, x, pillWidth]);
  const pill = useAnimatedStyle(() => ({
    width: pillWidth.value,
    transform: [{ translateX: direction * (x.value - pillWidth.value / 2) }],
  }));
  return <View style={dock.wrap} pointerEvents="box-none">
    <View accessibilityRole="tablist" accessibilityLabel="Quick navigation" testID="nav-dock" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={[dock.root, { backgroundColor: color.surfaceRaised }, elevation.level2]}>
      {width ? <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
        style={[dock.pill, { backgroundColor: color.primary, height, top: (layout.navHeight - height) / 2 }, pill]} /> : null}
      {routes.map(route => {
        const selected = route.key === current;
        const tintColor = selected ? color.onPrimary : color.text2;
        return <Pressable key={route.key} testID={`nav-${route.key}`} accessibilityRole="tab" accessibilityLabel={route.label}
          accessibilityState={{ selected, ...(route.key === 'more' ? { expanded: moreOpen } : {}) }} onPress={() => onPress(route.key)}
          style={({ pressed }) => [dock.item, pressed && dock.pressed]}>
          <Icon name={route.icon} tintColor={tintColor} />
          {labels ? <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[type.labelS, dock.label, { color: tintColor }, selected && dock.labelActive]}>{route.label}</Text> : null}
        </Pressable>;
      })}
    </View>
  </View>;
}

const dock = StyleSheet.create({
  wrap: { paddingHorizontal: dockGeometry.inset, paddingTop: 4, paddingBottom: dockGeometry.inset },
  root: { height: layout.navHeight, borderRadius: radius.xl, flexDirection: 'row' },
  pill: { position: 'absolute', start: 0, borderRadius: radius.pill },
  item: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, gap: 4 },
  label: { textAlign: 'center', maxWidth: '100%' },
  labelActive: { fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.7 },
});
