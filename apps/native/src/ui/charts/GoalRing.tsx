import { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ChartA11y } from './ChartA11y';
import { arcPath } from './arcs';
import { goalRingColor, goalRingLabel, type GoalStatus } from './chartMath';
import { useDrawProgress } from './plot';

export function GoalRing({ progress, status, size = 64, showLabel = true }: {
  progress: number; status: GoalStatus; size?: 44 | 64 | 120; showLabel?: boolean;
}) {
  const { color } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const center = size / 2;
  const width = size === 120 ? 10 : 5;
  const radius = center - width / 2;
  const path = useMemo(() => arcPath(center, center, radius, -90, 360), [center, radius]);
  const { end } = useDrawProgress('goal');
  const arcEnd = useDerivedValue(() => clamped * end.value);

  return (
    <ChartA11y label={goalRingLabel(clamped, status)}>
      <View style={{ width: size, height: size }}>
        <Canvas style={{ flex: 1 }}>
          <Circle cx={center} cy={center} r={radius} style="stroke" strokeWidth={width} color={color.chartTrack} />
          {clamped > 0 && status !== 'new' && <Path path={path} style="stroke" strokeWidth={width}
            strokeCap="round" color={color[goalRingColor(status)]} end={arcEnd} />}
        </Canvas>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          {showLabel && (status === 'completed' ? <Icon name={{ ios: 'checkmark', android: 'check' }} color="income" size={size / 3} />
            : <Text variant={size === 120 ? 'headline' : 'caption'} numeric>{Math.round(clamped * 100)}%</Text>)}
        </View>
      </View>
    </ChartA11y>
  );
}
