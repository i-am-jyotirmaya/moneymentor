import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { DashPathEffect, Group, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { CartesianChart, Line, Scatter, useChartPressState, type ChartBounds } from 'victory-native';
import type { GoalPlanOption } from '../../api/workspace-models';
import { formatDate, formatInr, spokenInr } from '../../lib/format';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { withAlpha } from '../color';
import { ChartA11y } from './ChartA11y';
import { ChartDataList } from './ChartDataList';
import { LegendKey } from './LegendKey';
import { niceTicks } from './chartMath';
import { noFrame, PlotGrid, PlotLabels, PlotTooltip, scrubConfig, useLineMotion, usePlotFonts, usePlotSelection, usePlotTap } from './plot';

const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const finishFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export function GoalProjection({ current, target, start, milestones, projectedCompletionDate }: {
  current: number; target: number; start: Date; milestones: GoalPlanOption['milestones'];
  projectedCompletionDate: GoalPlanOption['projectedCompletionDate'];
}) {
  const { color, fontScale } = useTheme();
  const fonts = usePlotFonts();
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const startTime = Math.min(start.getTime(), today);
  const endTime = Date.parse(projectedCompletionDate);
  const data = useMemo(() => {
    const future = milestones.map(milestone => ({
      date: Date.parse(milestone.targetDate), label: milestone.label, saved: null, plan: milestone.targetAmount,
    })).filter(point => point.date > today && (!Number.isFinite(endTime) || point.date <= endTime));
    if (endTime > today && !future.some(point => point.date === endTime)) {
      future.push({ date: endTime, label: 'Target', saved: null, plan: target });
    }
    future.sort((a, b) => a.date - b.date);
    return [
      ...(startTime < today ? [{ date: startTime, label: monthFormat.format(startTime), saved: 0, plan: null }] : []),
      { date: today, label: 'Today', saved: current, plan: current },
      ...future,
    ];
  }, [current, endTime, milestones, startTime, target, today]);
  const todayIndex = startTime < today ? 1 : 0;
  const lastIndex = data.length - 1;
  const future = data.slice(todayIndex + 1);
  const maximum = Math.max(1, current, target, ...future.map(point => point.plan ?? 0));
  const ticks = [...new Set([...niceTicks(maximum, 3), target])].sort((a, b) => a - b);
  const { state } = useChartPressState({ x: 0, y: { saved: 0, plan: 0 } });
  const selection = usePlotSelection(state, data.length);
  const plot = useRef<{ xs: number[]; bounds: ChartBounds } | null>(null);
  const tap = usePlotTap((x, y) => {
    if (plot.current) selection.tap(plot.current.xs, plot.current.bounds, x, y);
  });
  const hasPlan = milestones.length > 0 && future.length > 0;
  const animation = useLineMotion(`${startTime},${today},${endTime}`, `${current}/${future.map(point => `${point.date}:${point.plan}`).join(',')}`, hasPlan);
  const dotScale = useDerivedValue(() => [{ scale: animation.dots.value }]);
  const label = (i: number) => `${data[i].label}, ${formatDate(new Date(data[i].date).toISOString())}, ${spokenInr(data[i].saved ?? data[i].plan ?? 0)}.`;
  const summary = `Goal projection. Saved ${spokenInr(current)} of ${spokenInr(target)}.`;
  const planColor = withAlpha(color.chartSpend, 0.7);
  const axis = (value: number) => formatInr(value, { compact: true });

  return (
    <>
      <ChartA11y label={hasPlan ? `${summary} ${label(lastIndex)}` : `${summary} Add a monthly amount to see a finish date.`}
        onIncrement={hasPlan ? () => selection.step(1, label) : undefined}
        onDecrement={hasPlan ? () => selection.step(-1, label) : undefined}>
        {!hasPlan ? <Text variant="caption" tone="text2">Add a monthly amount to see a finish date</Text> :
          <View style={{ height: 150 }}>
            <CartesianChart data={data} xKey="date" yKeys={['saved', 'plan']} frame={noFrame}
              domain={{ y: [0, ticks[ticks.length - 1]] }} chartPressState={state} chartPressConfig={scrubConfig}
              padding={{ left: 26 + fontScale * 18, right: 26, top: 46, bottom: 10 + fontScale * 11 }}
              viewport={{ x: [startTime, data[lastIndex].date], y: [0, ticks[ticks.length - 1]] }} domainPadding={{ left: 4, right: 4 }} customGestures={tap}
              renderOutside={({ chartBounds: bounds, points, yScale }) => {
                const i = selection.index;
                return (
                  <>
                    <PlotGrid bounds={bounds} scale={yScale} ticks={ticks} font={fonts.regular} format={axis} labelsOnly />
                    <PlotLabels points={points.plan} labels={data.map((point, index) => index === lastIndex ? finishFormat.format(point.date) : point.label)}
                      bounds={bounds} fonts={fonts} highlighted={todayIndex} visible={todayIndex === 1 ? [0, lastIndex] : [lastIndex]} />
                    {data[i] && <PlotTooltip bounds={bounds} x={points.plan[i].x}
                      y={points.plan[i].y ?? points.saved[i].y ?? bounds.bottom} font={fonts.tooltip}
                      lines={[data[i].label, `${formatDate(new Date(data[i].date).toISOString())} · ${formatInr(data[i].saved ?? data[i].plan ?? 0)}`]} />}
                  </>
                );
              }}>
              {({ chartBounds: bounds, points, yScale }) => {
                plot.current = { bounds, xs: points.plan.map(point => point.x) };
                return (
                  <>
                    <PlotGrid bounds={bounds} scale={yScale} ticks={ticks} font={null} format={axis} />
                    <Group opacity={animation.opacity}>
                      <Line points={points.saved} color={color.chartSpend} strokeWidth={2.5} end={animation.end} />
                      <Line points={points.plan} color={planColor} strokeWidth={2} end={animation.end}>
                        <DashPathEffect intervals={[4, 4]} />
                      </Line>
                      {points.plan.slice(todayIndex).map((point, i) => point.y == null ? null : (
                        <Group key={`${point.xValue}:${i}`} transform={dotScale} origin={vec(point.x, point.y)}>
                          <Scatter points={[point]} radius={i === 0 ? 3 : 2} color={i === 0 ? color.chartSpend : color.surface} />
                          <Scatter points={[point]} radius={i === 0 ? 3 : 2} style="stroke"
                            strokeWidth={i === 0 ? 2 : 1} color={i === 0 ? color.surface : planColor} />
                        </Group>
                      ))}
                    </Group>
                  </>
                );
              }}
            </CartesianChart>
          </View>}
      </ChartA11y>
      {hasPlan && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <LegendKey line color={color.chartSpend} label="Saved (contributions)" />
        <LegendKey line dashed color={planColor} label="Plan milestones" />
      </View>}
      {hasPlan && <ChartDataList label="goal projection data" rows={data.map((point, i) => ({
        key: `${point.date}:${i}`, text: label(i),
      }))} />}
    </>
  );
}
