import { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { CountUp } from '../CountUp';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { withAlpha } from '../color';
import { ChartA11y } from './ChartA11y';
import { arcPath } from './arcs';
import { sliceGaugeLabel, sliceGeometry } from './chartMath';
import { useDrawProgress } from './plot';

function displayRate(rate: number) {
  'worklet';
  return `${rate < 0 ? '−' : ''}${Math.round(Math.abs(rate))}%`;
}

export function SliceGauge({ rate, size = 92 }: { rate: number; size?: number }) {
  const { color } = useTheme();
  const geometry = sliceGeometry(rate);
  const scale = size / 100;
  const cx = geometry.cx * scale;
  const cy = geometry.cy * scale;
  const width = 16 * scale;
  const radius = geometry.radius * scale - width / 2;
  const path = useMemo(() => arcPath(cx, cy, radius, geometry.startAngle, 360), [cx, cy, radius, geometry.startAngle]);
  const { end } = useDrawProgress('gauge', true, 'countUp');
  const arcEnd = useDerivedValue(() => end.value * geometry.sweepAngle / 360);

  return (
    <ChartA11y label={sliceGaugeLabel(rate)}>
      <View style={{ width: size, height: size }}>
        <Canvas style={{ flex: 1 }}>
          <Circle cx={cx} cy={cy} r={radius} style="stroke" strokeWidth={width} color={withAlpha(color.onHero, 0.22)} />
          {rate > 0 && <Path path={path} style="stroke" strokeWidth={width} strokeCap="round" color={color.onHero} end={arcEnd} />}
        </Canvas>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: size - cx * 2,
          top: cy * 2 - size, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View><CountUp value={rate} format={displayRate} tone="onHero" variant="numberL" /></View>
          <Text variant="overline" tone="onHeroMuted" maxFontSizeMultiplier={1.3}>{rate < 0 ? 'Deficit' : 'Kept'}</Text>
        </View>
      </View>
    </ChartA11y>
  );
}
