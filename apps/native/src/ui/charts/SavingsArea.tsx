import { useRef } from 'react';
import { View } from 'react-native';
import { DashPathEffect, Group, Line as SkiaLine, LinearGradient, Text as SkiaText, vec } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { Area, CartesianChart, Line, Scatter, useChartPressState, type ChartBounds } from 'victory-native';
import { getCurrentMonthKey } from '../../lib/format';
import { withAlpha } from '../color';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ChartA11y } from './ChartA11y';
import { ChartDataList } from './ChartDataList';
import { fullMonth, percentText, savingsBaseline, savingsSummary, type SavingsBaseline, type SavingsPoint } from './chartMath';
import { DeficitBand, noFrame, PlotBand, PlotGrid, PlotLabels, PlotTooltip, scrubConfig, useLineMotion, usePlotFonts, usePlotSelection, usePlotTap } from './plot';

type Props = {
  points: SavingsPoint[];
  baseline?: SavingsBaseline;
  height?: number;
};

export function SavingsArea({ points, baseline, height = 140 }: Props) {
  const { color, gradient, fontScale } = useTheme();
  const fonts = usePlotFonts();
  const data = points;
  const average = savingsBaseline(data, baseline);
  const rates = data.flatMap(({ rate }) => rate == null ? [] : [rate]);
  const values = average ? [...rates, average.value] : rates;
  const low = Math.floor(Math.min(...values, 100) / 20) * 20;
  const high = Math.max(low + 20, Math.ceil(Math.max(...values, low) / 20) * 20);
  const step = 20 * Math.max(1, Math.ceil((high - low) / 60));
  const ticks = Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, i) => low + i * step);
  if (ticks.at(-1) !== high && ticks.length < 4) ticks.push(high);
  const current = data.findIndex(point => point.key === getCurrentMonthKey());
  const { state } = useChartPressState({ x: '', y: { rate: 0 } });
  const selection = usePlotSelection(state, data.length);
  const selected = data[selection.index];
  const plot = useRef<{ xs: number[]; bounds: ChartBounds } | null>(null);
  const tap = usePlotTap((x, y) => {
    if (plot.current) selection.tap(plot.current.xs, plot.current.bounds, x, y);
  });
  const animation = useLineMotion(data.map(point => point.key).join(','), `${data.map(point => point.rate).join(',')}/${average?.value}`, rates.length >= 2);
  const dotScale = useDerivedValue(() => [{ scale: animation.dots.value }]);
  const format = (rate: number) => `${percentText(rate)}%`;
  const label = (index: number) => data[index].rate == null ? `${fullMonth(data[index].key)}, no data.`
    : `${fullMonth(data[index].key)}, ${percentText(data[index].rate!)} percent.`;

  return (
    <>
      <ChartA11y label={savingsSummary(data, average)}
        onIncrement={rates.length >= 2 ? () => selection.step(1, label) : undefined}
        onDecrement={rates.length >= 2 ? () => selection.step(-1, label) : undefined}>
        {rates.length < 2 ? (
          <View style={{ height, justifyContent: 'center' }}>
            <Text variant="display" numeric>{rates.length ? `${format(rates[0])} ${rates[0] < 0 ? 'deficit' : 'kept'}` : '—'}</Text>
            <Text variant="caption" tone="text2">Trend appears after 2 months</Text>
          </View>
        ) : (
          <View style={{ height }}>
            <CartesianChart data={data} xKey="key" yKeys={['rate']} domain={{ y: [low, high] }} frame={noFrame}
              padding={{ left: 22 + fontScale * 16, right: 5, top: 46, bottom: 10 + fontScale * 11 }}
              viewport={{ x: [0, data.length - 1], y: [low, high] }} domainPadding={{ left: 13, right: 13 }} chartPressState={state} chartPressConfig={scrubConfig} customGestures={tap}
              renderOutside={({ chartBounds: bounds, points: plotPoints, yScale }) => {
                const dot = plotPoints.rate[selection.index];
                return (
                  <>
                    <PlotGrid bounds={bounds} scale={yScale} ticks={ticks} font={fonts.regular} format={format} labelsOnly />
                    <PlotLabels points={plotPoints.rate} labels={data.map(point => point.rate == null ? '—' : point.label)}
                      bounds={bounds} fonts={fonts} highlighted={current} />
                    {average && fonts.regular && <Group opacity={animation.baseline}>
                      <SkiaText x={bounds.left + 3} y={bounds.top - 5} text={`${average.label} ${format(average.value)}`}
                        color={color.chartTarget} font={fonts.regular} />
                    </Group>}
                    {dot && selected && <PlotTooltip bounds={bounds} x={dot.x} y={dot.y ?? bounds.bottom} fullCursor
                      font={fonts.tooltip} deficit={(selected.rate ?? 0) < 0}
                      lines={selected.rate == null ? [`${selected.label} · No data`] : [
                        `${selected.label} · ${selected.rate < 0 ? '↘ ' : ''}${format(selected.rate)} ${selected.rate < 0 ? 'deficit' : 'kept'}`,
                      ]} />}
                  </>
                );
              }}>
              {({ chartBounds: bounds, points: plotPoints, yScale }) => {
                const xs = plotPoints.rate.map(point => point.x);
                plot.current = { xs, bounds };
                const zero = yScale(0);
                return (
                  <>
                    <PlotBand bounds={bounds} x={xs[current]} width={(xs[1] - xs[0]) * 0.9} />
                    {low < 0 && <DeficitBand bounds={bounds} zero={Math.max(bounds.top, zero)} />}
                    <PlotGrid bounds={bounds} scale={yScale} ticks={ticks} font={null} format={format} />
                    <Group opacity={animation.opacity}>
                      <Group opacity={animation.area} clip={{ x: bounds.left, y: bounds.top, width: bounds.right - bounds.left,
                        height: Math.max(0, Math.min(bounds.bottom, zero) - bounds.top) }}>
                        <Area points={plotPoints.rate} curveType="monotoneX" y0={Math.min(bounds.bottom, zero)}>
                          <LinearGradient start={vec(0, bounds.top)} end={vec(0, bounds.bottom)}
                            colors={[withAlpha(gradient.chartArea.color, gradient.chartArea.from), withAlpha(gradient.chartArea.color, gradient.chartArea.to)]} />
                        </Area>
                      </Group>
                      {average && <Group opacity={animation.baseline}>
                        <SkiaLine p1={vec(bounds.left, yScale(average.value))} p2={vec(bounds.right, yScale(average.value))}
                          color={color.chartTarget} strokeWidth={1.5}><DashPathEffect intervals={[4, 4]} /></SkiaLine>
                      </Group>}
                      <Line points={plotPoints.rate} curveType="monotoneX" strokeWidth={2.5} strokeJoin="round"
                        color={color.chartSpend} end={animation.end} />
                      {plotPoints.rate.map((point, i) => {
                        if (point.y == null || point.yValue == null) return null;
                        const negative = point.yValue < 0;
                        return (
                          <Group key={data[i].key} origin={vec(point.x, point.y)} transform={dotScale}>
                            <Scatter points={[point]} radius={i === selection.index ? 3 : 2} color={negative ? color.negative : color.surface} />
                            {!negative && <Scatter points={[point]} radius={i === selection.index ? 3 : 2}
                              style="stroke" strokeWidth={2} color={color.chartSpend} />}
                            {negative && fonts.regular && <SkiaText font={fonts.regular} text={format(point.yValue)}
                              x={point.x + 4} y={Math.min(bounds.bottom - 2, point.y + 12)} color={color.negative} />}
                          </Group>
                        );
                      })}
                    </Group>
                  </>
                );
              }}
            </CartesianChart>
          </View>
        )}
      </ChartA11y>
      {rates.length >= 2 && <ChartDataList label="savings data" rows={data.map((point, i) => ({
        key: point.key, text: label(i),
      }))} />}
    </>
  );
}
