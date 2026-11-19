import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { selectionAsync } from 'expo-haptics';
import { Group, Line, Rect, RoundedRect, Text as SkiaText, useFont, vec } from '@shopify/react-native-skia';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import { useAnimatedReaction, useDerivedValue, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ChartBounds, ChartPressState, PointsArray, Scale } from 'victory-native';
import { useTheme } from '../ThemeProvider';
import { dur, spring, timing } from '../motion';
import { axisLabelStride, nearestIndex } from './chartMath';

export const scrubConfig = { pan: { activateAfterLongPress: 120 } };
export const noFrame = { lineWidth: 0 };

export function usePlotFonts() {
  const { fontScale } = useTheme();
  const regular = useFont(require('@expo-google-fonts/inter-tight/600SemiBold/InterTight_600SemiBold.ttf'), 11 * fontScale);
  const bold = useFont(require('@expo-google-fonts/inter-tight/700Bold/InterTight_700Bold.ttf'), 11 * fontScale);
  const tooltip = useFont(require('@expo-google-fonts/inter-tight/600SemiBold/InterTight_600SemiBold.ttf'), 11 * Math.min(1.35, fontScale));
  return { regular, bold, tooltip };
}

export function usePlotSelection<T extends { x: string | number; y: Record<string, number> }>(
  state: ChartPressState<T>, length: number, onSelect?: (index: number) => void, controlled?: number,
) {
  const [local, setLocal] = useState(-1);
  const index = controlled ?? local;
  const latest = useRef(index);
  useEffect(() => { latest.current = index; }, [index]);

  const select = useCallback((next: number) => {
    if (next === latest.current || next < -1 || next >= length) return;
    latest.current = next;
    setLocal(next);
    onSelect?.(next);
    if (next >= 0) void selectionAsync().catch(() => {});
  }, [length, onSelect]);

  useAnimatedReaction(
    () => state.isActive.value ? state.matchedIndex.value : -1,
    (next, previous) => {
      if (next >= 0 && next !== previous) scheduleOnRN(select, next);
    },
  );

  function tap(xs: number[], bounds: ChartBounds, x: number, y: number) {
    if (x < bounds.left || x > bounds.right || y < bounds.top - 46 || y > bounds.bottom + 26) {
      select(-1);
      return;
    }
    select(nearestIndex(x, xs));
  }

  function step(by: number, label: (index: number) => string) {
    const next = Math.min(length - 1, Math.max(0, index < 0 ? (by > 0 ? 0 : length - 1) : index + by));
    if (next >= 0) {
      select(next);
      AccessibilityInfo.announceForAccessibility(label(next));
    }
  }

  return { index, step, tap };
}

export function usePlotTap(onTap: (x: number, y: number) => void) {
  // Victory 42 composes legacy Gesture.Race at runtime, but declares the v3 gesture type.
  return Gesture.Race(Gesture.Tap().onEnd((event, success) => {
    if (success) scheduleOnRN(onTap, event.x, event.y);
  })) as unknown as ComposedGesture;
}

export function useDrawProgress(series: string, ready = true, duration: 'chart' | 'countUp' = 'chart', delay = 0, revision = '') {
  const reduced = useReducedMotion();
  const end = useSharedValue(reduced ? 1 : 0);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const previous = useRef<{ series: string; revision: string } | null>(null);
  useEffect(() => {
    if (!ready) return;
    const last = previous.current;
    previous.current = { series, revision };
    if (last?.series === series) {
      if (last.revision !== revision) {
        opacity.value = 0;
        opacity.value = withTiming(1, { ...timing('fast'), reduceMotion: undefined });
      }
      return;
    }
    if (reduced) {
      end.value = 1;
      opacity.value = last === null ? 0 : 1;
      if (last === null) opacity.value = withTiming(1, { ...timing('fast'), reduceMotion: undefined });
    } else {
      opacity.value = 1;
      const animation = withTiming(1, timing(last === null ? duration : 'slow', 'decelerate'));
      end.value = 0;
      end.value = delay ? withDelay(delay, animation) : animation;
    }
  }, [series, ready, duration, delay, end, opacity, reduced, revision]);
  return { end, opacity, reduced };
}

export function useLineMotion(series: string, revision: string, ready = true) {
  const draw = useDrawProgress(series, ready, 'chart', 0, revision);
  const area = useSharedValue(0);
  const dots = useSharedValue(0);
  const baseline = useSharedValue(0);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const first = last.current === null;
    last.current = series;
    area.value = draw.reduced ? 1 : 0;
    dots.value = draw.reduced ? 1 : 0;
    baseline.value = 0;
    if (!draw.reduced) {
      area.value = withDelay(200, withTiming(1, timing('slow')));
      dots.value = withDelay(first ? dur.chart : dur.slow, withSpring(1, spring.pop));
    }
    baseline.value = withTiming(1, timing('fast'));
  }, [area, baseline, dots, draw.reduced, ready, series]);
  return { ...draw, area, dots, baseline };
}

export function PlotGrid({ bounds, scale, ticks, format, font, labelsOnly }: {
  bounds: ChartBounds; scale: Scale; ticks: number[]; format: (value: number) => string;
  font: ReturnType<typeof usePlotFonts>['regular']; labelsOnly?: boolean;
}) {
  const { color } = useTheme();
  return ticks.map(value => {
    const y = scale(value);
    const label = format(value);
    return (
      <Group key={value}>
        {!labelsOnly && <Line p1={vec(bounds.left, y)} p2={vec(bounds.right, y)} color={color.chartGrid} strokeWidth={StyleSheet.hairlineWidth} />}
        {font && <SkiaText x={Math.max(0, bounds.left - font.measureText(label).width - 5)}
          y={y + font.getSize() / 3} text={label} font={font} color={color.chartAxis} />}
      </Group>
    );
  });
}

export function PlotLabels({ points, labels, bounds, fonts, highlighted, visible }: {
  points: PointsArray; labels: string[]; bounds: ChartBounds; fonts: ReturnType<typeof usePlotFonts>;
  highlighted: number; visible?: number[];
}) {
  const { color, fontScale } = useTheme();
  return points.map(({ x }, index) => {
    const active = index === highlighted;
    if (!active && (visible ? !visible.includes(index) :
      ((points.length - 1 - index) % axisLabelStride(fontScale) !== 0
        || (points.length > 8 && fontScale < 1.3 && (points.length - 1 - index) % 2 !== 0)))) return null;
    const font = active ? fonts.bold ?? fonts.regular : fonts.regular;
    const label = labels[index];
    if (!font || !label) return null;
    return <SkiaText key={index} text={label} font={font} x={x - font.measureText(label).width / 2}
      y={bounds.bottom + font.getSize() + 4} color={active ? color.text : color.chartAxis} />;
  });
}

export function PlotBand({ bounds, x, width }: { bounds: ChartBounds; x?: number; width: number }) {
  const { color } = useTheme();
  if (x == null) return null;
  return <RoundedRect x={x - width / 2} y={bounds.top - 4} width={width} height={bounds.bottom - bounds.top + 4}
    r={6} color={color.surfaceTonal} />;
}

export function PlotTooltip({ bounds, x, y, lines, deficit, font, fullCursor }: {
  bounds: ChartBounds; x: number; y: number; lines: string[]; deficit?: boolean;
  font: ReturnType<typeof usePlotFonts>['regular']; fullCursor?: boolean;
}) {
  const { color, radius } = useTheme();
  const reduced = useReducedMotion();
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withTiming(1, { ...timing('fast'), reduceMotion: undefined });
  }, [appear]);
  const transform = useDerivedValue(() => [{ scale: reduced ? 1 : 0.96 + appear.value * 0.04 }]);
  if (!font) return null;
  const lineHeight = font.getSize() + 2;
  const width = Math.min(bounds.right - bounds.left, Math.max(...lines.map(line => font.measureText(line).width)) + 16);
  const height = lines.length * lineHeight + 8;
  const left = Math.min(bounds.right - width, Math.max(bounds.left, x - width / 2));
  const top = Math.max(0, bounds.top - height - 4);
  return (
    <>
      <Line p1={vec(x, top + height)} p2={vec(x, fullCursor ? bounds.bottom : y)}
        strokeWidth={1} color={color.outlineStrong} />
      <Group opacity={appear} transform={transform} origin={vec(left + width / 2, top + height / 2)}>
        <RoundedRect x={left} y={top} width={width} height={height} r={radius.s} color={color.text} />
        <Group clip={{ x: left + 5, y: top, width: Math.max(0, width - 10), height }}>
          {lines.map((line, i) => <SkiaText key={i} x={left + 8} y={top + 4 + font.getSize() + lineHeight * i}
            text={line} font={font} color={deficit && i === 0 ? color.negativeContainer : color.bg} />)}
        </Group>
      </Group>
    </>
  );
}

export function DeficitBand({ bounds, zero }: { bounds: ChartBounds; zero: number }) {
  const { color } = useTheme();
  if (zero >= bounds.bottom) return null;
  return <Rect x={bounds.left} y={zero} width={bounds.right - bounds.left} height={bounds.bottom - zero}
    color={color.negativeContainer} />;
}
