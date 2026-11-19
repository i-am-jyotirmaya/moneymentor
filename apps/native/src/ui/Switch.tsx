import { useEffect } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from './Icon';
import { spring, timing } from './motion';
import { PressableScale } from './PressableScale';
import { useTheme } from './ThemeProvider';

export function SwitchThumb({ value }: { value: boolean }) {
  const { color, radius } = useTheme();
  const position = useSharedValue(value ? 20 : 0);
  const fill = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    position.value = withSpring(value ? 20 : 0, spring.indicator);
    fill.value = withTiming(value ? 1 : 0, timing('fast'));
  }, [value, position, fill]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  const rail = useAnimatedStyle(() => ({ opacity: fill.value }));
  return (
    <View style={{ width: 52, height: 32, borderRadius: radius.pill, justifyContent: 'center',
      backgroundColor: color.surfaceSunken }}>
      <View style={{ position: 'absolute', inset: 0, borderWidth: 1, borderColor: color.outlineStrong, borderRadius: radius.pill }} />
      <Animated.View style={[{ position: 'absolute', inset: 0, borderRadius: radius.pill, backgroundColor: color.primary }, rail]} />
      <Animated.View style={[{ marginLeft: 4, width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center',
        justifyContent: 'center', backgroundColor: value ? color.onPrimary : color.outlineStrong }, thumb]}>
        {value && <Icon name={{ ios: 'checkmark', android: 'check' }} size={16} color="primary" />}
      </Animated.View>
    </View>
  );
}

export function Switch({ value, onValueChange, label }: {
  value: boolean; onValueChange: (value: boolean) => void; label: string;
}) {
  return (
    <PressableScale accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }}
      onPress={() => { void Haptics.selectionAsync().catch(() => {}); onValueChange(!value); }}
      layer="none" contentStyle={{ alignItems: 'center' }}>
      <SwitchThumb value={value} />
    </PressableScale>
  );
}
