import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Canvas, Circle, Group, Line, Path, Skia, vec } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { formatInr, getCurrentMonthKey } from '../../lib/format';
import { CountUp } from '../CountUp';
import { dur, spring, timing } from '../motion';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ChartA11y } from './ChartA11y';
import { PlanNote } from './CategoryPlanList';
import { arcPath } from './arcs';
import { categoryLabel, collapseSlices, donutLegendPlacement, donutRows, donutSummary, type DonutSlice } from './chartMath';
import { useDrawProgress } from './plot';

type ColoredSlice = ReturnType<typeof collapseSlices>[number] & { tint: string };
type Arc = ColoredSlice & { from: number; angle: number };

function layoutSlices(slices: ColoredSlice[], total: number): Arc[] {
  const gap = slices.length > 1 ? 1.6 : 0;
  const available = 360 - slices.length * gap;
  const minimum = slices.filter(slice => slice.amount / total < 0.02);
  const remaining = slices.filter(slice => slice.amount / total >= 0.02).reduce((sum, slice) => sum + slice.amount, 0);
  let from = 0;
  return slices.map(slice => {
    const angle = remaining === 0 ? available / slices.length : minimum.includes(slice) ? 2
      : (available - minimum.length * 2) * slice.amount / remaining;
    const arc = { ...slice, from, angle };
    from += angle + gap;
    return arc;
  });
}

function DonutSegment({ arc, size, active, dimmed, sweep }: {
  arc: Arc; size: number; active: boolean; dimmed: boolean; sweep: SharedValue<number>;
}) {
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const center = size / 2;
  const outer = center - 6;
  const width = outer * 0.3;
  const radius = outer - width / 2;
  const middle = (arc.from + arc.angle / 2 - 90) * Math.PI / 180;
  const pull = useSharedValue(0);
  const opacity = useSharedValue(1);
  const path = useMemo(() => arcPath(center, center, radius, arc.from - 90, arc.angle), [arc.angle, arc.from, center, radius]);
  const hatch = useMemo(() => arc.hatch ? Skia.Path.Stroke(path, { width }) : null, [arc.hatch, path, width]);
  const end = useDerivedValue(() => Math.max(0, Math.min(1, (sweep.value * 360 - arc.from) / arc.angle)));
  const hatchOpacity = useDerivedValue(() => end.value >= 1 ? 0.3 : 0);
  const transform = useDerivedValue(() => [
    { translateX: pull.value * Math.cos(middle) }, { translateY: pull.value * Math.sin(middle) },
  ]);

  useEffect(() => {
    pull.value = reduced ? (active ? 5 : 0) : withSpring(active ? 5 : 0, spring.pop);
    opacity.value = reduced ? (dimmed ? 0.35 : 1) : withTiming(dimmed ? 0.35 : 1, timing('fast'));
  }, [active, dimmed, opacity, pull, reduced]);

  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path} color={arc.tint} strokeWidth={width} style="stroke" end={end} />
      {hatch && <Group clip={hatch} opacity={hatchOpacity}>
        {Array.from({ length: Math.ceil(size / 3) }, (_, i) =>
          <Line key={i} p1={vec(i * 6, 0)} p2={vec(i * 6 - size, size)} color={color.surface} strokeWidth={1} />)}
      </Group>}
    </Group>
  );
}

function centerStyle(size: number): ViewStyle {
  return { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: size * 0.17 };
}

export function CategoryDonut({ slices, total, selectedId, onSelect, size = 150, centerLabel = 'Spent', colorFor, legend = false }: {
  slices: readonly DonutSlice[]; total: number; selectedId?: string | null;
  onSelect?: (id: string | null) => void; size?: number; centerLabel?: string;
  colorFor?: (slice: DonutSlice) => string; legend?: boolean;
}) {
  const { category, color, fontScale } = useTheme();
  const month = getCurrentMonthKey();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const horizontal = legend && donutLegendPlacement(fontScale) === 'side' && width >= size + 12 + 155 * fontScale;
  const [local, setLocal] = useState<string | null>(null);
  const rows = colorFor ? donutRows(slices) : undefined;
  const collapsed = collapseSlices(slices).flatMap((slice, index) => slice.amount > 0 ? [{
    ...slice,
    tint: colorFor && rows ? colorFor(rows[index]) : category[slice.colorIndex],
    hatch: !colorFor && slice.hatch,
  }] : []);
  const arcs = total > 0 ? layoutSlices(collapsed, total) : [];
  const selected = arcs.find(arc => arc.id === (selectedId === undefined ? local : selectedId));
  const revision = arcs.map(arc => `${arc.id}:${arc.amount}`).join(',');
  const { end, opacity } = useDrawProgress(month, arcs.length > 0, 'chart', 0, revision);
  const hasSelection = selected != null;
  const totalOpacity = useSharedValue(hasSelection ? 0 : 1);
  const totalStyle = useAnimatedStyle(() => ({ opacity: totalOpacity.value }));
  useEffect(() => {
    const opacity = hasSelection ? 0 : 1;
    totalOpacity.set(reduced ? opacity : withTiming(opacity, timing('fast')));
  }, [hasSelection, reduced, totalOpacity]);
  function select(id: string | null) {
    const next = selected?.id === id ? null : id;
    setLocal(next);
    onSelect?.(next);
  }
  const tap = Gesture.Tap().runOnJS(true).onEnd((event, success) => {
    if (!success) return;
    const dx = event.x - size / 2;
    const dy = event.y - size / 2;
    const radius = Math.hypot(dx, dy);
    if (radius < (size / 2 - 6) * 0.7 - 3 || radius > size / 2) return select(null);
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
    select(arcs.find(arc => angle >= arc.from && angle <= arc.from + arc.angle)?.id ?? null);
  });

  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ gap: 12, flexDirection: horizontal && arcs.length > 0 ? 'row' : 'column', alignItems: 'center' }}>
      <ChartA11y label={donutSummary(collapsed, total, month)}>
        <GestureDetector gesture={tap}>
          <View style={{ width: size, height: size, alignSelf: 'center' }}>
            <Canvas style={{ flex: 1 }}>
              {arcs.length ? <Group opacity={opacity}>
                {arcs.map(arc => <DonutSegment key={arc.id} arc={arc} size={size}
                  active={selected?.id === arc.id} dimmed={selected != null && selected.id !== arc.id} sweep={end} />)}
              </Group> : <Circle cx={size / 2} cy={size / 2} r={(size / 2 - 6) * 0.85}
                style="stroke" strokeWidth={(size / 2 - 6) * 0.3} color={color.chartTrack} />}
            </Canvas>
            <Animated.View key={month} pointerEvents="none" style={[centerStyle(size), totalStyle]}>
              <Text variant="overline" tone="text2" numberOfLines={2} style={{ textAlign: 'center' }}>{centerLabel}</Text>
              <View><CountUp value={arcs.length ? total : 0} duration={dur.chart} variant={size >= 150 ? 'numberL' : 'number'} /></View>
            </Animated.View>
            {selected && <Animated.View key={selected.id} pointerEvents="none"
              entering={reduced ? undefined : FadeIn.duration(dur.fast)}
              exiting={reduced ? undefined : FadeOut.duration(dur.fast)} style={centerStyle(size)}>
              <Text variant="overline" tone="text2" numberOfLines={2} style={{ textAlign: 'center' }}>{selected.name}</Text>
              <Text variant={size < 150 ? 'number' : 'numberL'} numeric style={size < 150 ? { fontSize: 16 } : undefined}>
                {formatInr(selected.amount)}
              </Text>
            </Animated.View>}
          </View>
        </GestureDetector>
      </ChartA11y>
      {legend && arcs.length === 0 && <Text variant="caption" tone="text2" style={{ textAlign: 'center' }}>No spending yet</Text>}
      {legend && arcs.length > 0 && <View style={horizontal ? { flex: 1 } : { alignSelf: 'stretch' }}>
        {arcs.map(arc => {
          const share = arc.amount / total * 100;
          return (
            <Pressable key={arc.id} accessibilityRole="button" accessibilityLabel={categoryLabel(arc, total)}
              accessibilityHint="Shows transactions" accessibilityState={{ selected: selected?.id === arc.id }}
              onPress={() => select(arc.id)} style={{ minHeight: 48, justifyContent: 'center', gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, overflow: 'hidden', backgroundColor: arc.tint }}>
                  {arc.hatch && <Canvas style={{ flex: 1 }}>
                    {[3, 7, 11].map(x => <Line key={x} p1={vec(x, 0)} p2={vec(x - 8, 8)} color={color.surface} opacity={0.3} />)}
                  </Canvas>}
                </View>
                <Text variant="label" style={{ flex: 1 }}>{arc.name}</Text>
                <Text numeric variant="caption" tone="text2">{share < 2 ? '<1%' : `${Math.round(share)}%`}</Text>
                <Text numeric variant="number">{formatInr(arc.amount)}</Text>
              </View>
              {arc.budget != null && arc.amount > arc.budget && <PlanNote amount={arc.amount} budget={arc.budget} />}
            </Pressable>
          );
        })}
      </View>}
    </View>
  );
}
