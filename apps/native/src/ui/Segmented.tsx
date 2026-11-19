import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { spring } from './motion';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';

export function Segmented({ options, value, onChange }: {
  options: { key: string; label: string }[]; value: string; onChange: (key: string) => void;
}) {
  const { color, radius, elevation, space } = useTheme();
  const [width, setWidth] = useState(0);
  const index = options.findIndex(option => option.key === value);
  const inset = space.s2;
  const itemWidth = Math.max(0, width - 2 * inset) / Math.max(options.length, 1);
  const left = useSharedValue(0);
  useEffect(() => {
    left.value = withSpring(Math.max(0, index) * itemWidth, spring.indicator);
  }, [index, itemWidth, left]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: left.value }] }));

  if (!options.length) return null;
  return (
    <View accessibilityRole="tablist" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ borderRadius: radius.pill, backgroundColor: color.surfaceSunken, flexDirection: 'row', padding: inset }}>
      {index >= 0 && itemWidth > 0 && <Animated.View pointerEvents="none" style={[
        StyleSheet.absoluteFill, elevation.level1, { left: inset, top: inset, bottom: inset, width: itemWidth,
          borderRadius: radius.pill, backgroundColor: color.surface }, thumb,
      ]} />}
      {options.map(option => (
        <PressableScale key={option.key} accessibilityRole="tab" accessibilityState={{ selected: option.key === value }}
          style={{ flex: 1 }} contentStyle={{ alignItems: 'center', borderRadius: radius.pill, padding: space.s2 }}
          onPress={() => {
            if (option.key === value) return;
            void Haptics.selectionAsync().catch(() => {});
            onChange(option.key);
          }}>
          <Text variant="label" style={{ textAlign: 'center' }}>{option.label}</Text>
        </PressableScale>
      ))}
    </View>
  );
}
