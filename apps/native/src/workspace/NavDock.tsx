import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { layout, motion, radius, type } from '../ui/theme';
import { useTheme } from '../ui/ThemeProvider';
import { activeDockRoute, pillOffset, type DockRoute } from './navigation';
import { showNavLabels } from './section-state';
import { Icon } from './ui';

const springIndicator = { ...motion.spring.indicator, reduceMotion: ReduceMotion.System };
// Dock geometry from HANDOFF B1: 64×32 pill that stretches to 72, 12dp from the sides and bottom inset.
const dockGeometry = { inset: 12, pillWidth: 64, pillStretch: 72, pillHeight: 32 } as const;

export type NavDockRoute = { key: DockRoute; label: string; icon: SymbolViewProps['name'] };
export type NavDockProps = { routes: readonly NavDockRoute[]; active: string; moreOpen: boolean; onPress: (key: DockRoute) => void };

export function NavDock({ routes, active, moreOpen, onPress }: NavDockProps) {
  const { color, elevation, fontScale } = useTheme();
  const labels = showNavLabels(fontScale);
  const current = activeDockRoute(active, moreOpen);
  const index = Math.max(0, routes.findIndex(route => route.key === current));
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const pillWidth = useSharedValue<number>(dockGeometry.pillWidth as number);
  const placed = useRef<{ index: number; width: number } | null>(null);
  useEffect(() => {
    if (!width) return;
    const target = pillOffset(width, index, routes.length, dockGeometry.pillWidth);
    const last = placed.current;
    placed.current = { index, width };
    // First layout or a resize (rotation, font scale) places the pill without animating.
    if (!last || last.width !== width) { x.value = target; return; }
    if (last.index === index) return;
    x.value = withSpring(target, springIndicator);
    pillWidth.value = withSequence(withTiming(dockGeometry.pillStretch, { duration: motion.duration.instant, reduceMotion: ReduceMotion.System }), withSpring(dockGeometry.pillWidth, springIndicator));
  }, [index, width, routes.length, x, pillWidth]);
  // Keep the stretch centred on the item while it springs back to 64.
  const pill = useAnimatedStyle(() => ({ width: pillWidth.value, transform: [{ translateX: x.value - (pillWidth.value - dockGeometry.pillWidth) / 2 }] }));
  return <View style={dock.wrap} pointerEvents="box-none">
    <View accessibilityRole="tablist" accessibilityLabel="Quick navigation" testID="nav-dock" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={[dock.root, { backgroundColor: color.surfaceRaised }, elevation.level2]}>
      {width ? <Animated.View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
        style={[dock.pill, { backgroundColor: color.primary, top: labels ? 10 : (layout.navHeight - dockGeometry.pillHeight) / 2 }, pill]} /> : null}
      {routes.map(route => {
        const selected = route.key === current;
        return <Pressable key={route.key} testID={`nav-${route.key}`} accessibilityRole="tab" accessibilityLabel={route.label}
          accessibilityState={{ selected, ...(route.key === 'more' ? { expanded: moreOpen } : {}) }} onPress={() => onPress(route.key)}
          style={({ pressed }) => [dock.item, !labels && dock.itemCentered, pressed && dock.pressed]}>
          <View style={dock.iconSlot}><Icon name={route.icon} tintColor={selected ? color.onPrimary : color.text2} /></View>
          {labels ? <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[type.labelS, dock.label, { color: selected ? color.text : color.text2 }, selected && dock.labelActive]}>{route.label}</Text> : null}
        </Pressable>;
      })}
    </View>
  </View>;
}

const dock = StyleSheet.create({
  wrap: { paddingHorizontal: dockGeometry.inset, paddingTop: 4, paddingBottom: dockGeometry.inset },
  root: { height: layout.navHeight, borderRadius: radius.xl, flexDirection: 'row' },
  pill: { position: 'absolute', left: 0, height: dockGeometry.pillHeight, borderRadius: radius.pill },
  item: { flex: 1, minWidth: 64, minHeight: 64, alignItems: 'center', paddingTop: 10, gap: 4 },
  itemCentered: { justifyContent: 'center', paddingTop: 0 },
  iconSlot: { width: dockGeometry.pillWidth, height: dockGeometry.pillHeight, alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center', paddingHorizontal: 2 },
  labelActive: { fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.7 },
});
