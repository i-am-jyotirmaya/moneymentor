import { useCallback, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Group, RoundedRect } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { BarGroup, CartesianChart, useChartPressState, type ChartBounds, type PointsArray } from 'victory-native';
import { formatInr, getCurrentMonthKey, shiftMonthKey } from '../../lib/format';
import { Text } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ChartA11y } from './ChartA11y';
import { ChartDataList } from './ChartDataList';
import { cashFlowMonthLabel, cashFlowSummary, fullMonth, niceTicks, type TrendMonth } from './chartMath';
import { LegendKey } from './LegendKey';
import { noFrame, PlotBand, PlotGrid, PlotLabels, PlotTooltip, scrubConfig, useDrawProgress, usePlotFonts, usePlotSelection, usePlotTap } from './plot';

type Props = {
  months: readonly TrendMonth[];
  selected?: string;
  onSelect?: (key: string) => void;
  height?: number;
};

function BarPair({ bounds, income, spend, series, index, slot }: {
  bounds: ChartBounds; income: PointsArray[number]; spend: PointsArray[number];
  series: string; index: number; slot: number;
}) {
  const { color, motion } = useTheme();
  const { end, opacity } = useDrawProgress(series, true, 'chart', Math.min(index, motion.staggerMax - 1) * motion.stagger, `${income.yValue},${spend.yValue}`);
  const transform = useDerivedValue(() => [{ scaleY: end.value }]);
  const width = Math.min(14, slot * 0.28);
  // BarGroup derives its intra-pair gap from the width of the supplied bounds.
  const pairBounds = { ...bounds, right: bounds.left + (width * 2 + 4) / 0.6 };
  const barPoint = (point: PointsArray[number]) => [{
    ...point,
    y: point.y == null || !point.yValue ? null : Math.min(point.y, bounds.bottom - 3),
  }];

  return (
    <Group origin={{ x: income.x, y: bounds.bottom }} transform={transform} opacity={opacity}>
      <BarGroup chartBounds={pairBounds} betweenGroupPadding={0.4} withinGroupPadding={0.15}
        barWidth={width} roundedCorners={{ topLeft: 4, topRight: 4 }}>
        <BarGroup.Bar points={barPoint(income)} color={color.chartIncome} />
        <BarGroup.Bar points={barPoint(spend)} color={color.chartSpend} />
      </BarGroup>
    </Group>
  );
}

export function CashFlowBars({ months, selected, onSelect, height = 170 }: Props) {
  const { color, fontScale } = useTheme();
  const fonts = usePlotFonts();
  const data = useMemo(() => {
    const first = months[0];
    const missing = Math.max(0, 6 - months.length);
    const padding = first ? Array.from({ length: missing }, (_, i) => {
      const key = shiftMonthKey(first.key, i - missing);
      return { key, label: fullMonth(key).slice(0, 3), income: null, spend: null };
    }) : [];
    return [...padding, ...months].map(month => ({ ...month, month: month.key }));
  }, [months]);
  const ticks = niceTicks(Math.max(1, ...data.flatMap(month => [month.income ?? 0, month.spend ?? 0])) * 1.1);
  const current = data.findIndex(month => month.key === getCurrentMonthKey());
  const series = data.map(month => month.key).join(',');
  const { state } = useChartPressState({ x: '', y: { income: 0, spend: 0 } });
  const selectKey = useCallback((index: number) => {
    const month = data[index];
    if (month) onSelect?.(month.key);
  }, [data, onSelect]);
  const selection = usePlotSelection(state, data.length, selectKey,
    selected === undefined ? undefined : data.findIndex(month => month.key === selected));
  const plot = useRef<{ xs: number[]; bounds: ChartBounds } | null>(null);
  const tap = usePlotTap((x, y) => {
    if (plot.current) selection.tap(plot.current.xs, plot.current.bounds, x, y);
  });
  const chosen = data[selection.index];
  const hasData = months.some(month => month.income != null && month.spend != null);

  return (
    <>
      <ChartA11y label={cashFlowSummary(data)}
        onIncrement={hasData ? () => selection.step(1, i => cashFlowMonthLabel(data[i], i === current)) : undefined}
        onDecrement={hasData ? () => selection.step(-1, i => cashFlowMonthLabel(data[i], i === current)) : undefined}>
        {!hasData ? <Text>Your charts start with one entry</Text> :
          <View style={{ height }}>
            <CartesianChart data={data} xKey="month" yKeys={['income', 'spend']}
              domain={{ y: [0, ticks[ticks.length - 1]] }} frame={noFrame}
              padding={{ left: 30 + fontScale * 16, right: 5, top: 46, bottom: 10 + fontScale * 11 }}
              viewport={{ x: [0, data.length - 1], y: [0, ticks[ticks.length - 1]] }} domainPadding={{ left: 15, right: 15 }} chartPressState={state} chartPressConfig={scrubConfig} customGestures={tap}
              renderOutside={({ chartBounds: bounds, points, yScale }) => {
                const index = selection.index;
                const point = points.income[index];
                const net = (chosen?.income ?? 0) - (chosen?.spend ?? 0);
                const lines = chosen?.income == null || chosen.spend == null
                  ? [`${chosen?.label} · No data`]
                  : [`${chosen.label} · ${net < 0 ? '↓ ' : 'net '}${formatInr(net, { sign: 'always' })}${net < 0 ? ' deficit' : ''}`,
                    `In ${formatInr(chosen.income)}  Out ${formatInr(chosen.spend)}`];
                return (
                  <>
                    <PlotGrid bounds={bounds} scale={yScale} ticks={ticks} font={fonts.regular} labelsOnly
                      format={value => formatInr(value, { compact: true })} />
                    <PlotLabels points={points.income} labels={data.map(month => month.label)} bounds={bounds}
                      fonts={fonts} highlighted={current} />
                    {point && <PlotTooltip bounds={bounds} x={point.x} font={fonts.tooltip} lines={lines} deficit={net < 0}
                      y={Math.min(point.y ?? bounds.bottom, points.spend[index]?.y ?? bounds.bottom)} />}
                  </>
                );
              }}>
              {({ chartBounds: bounds, points, yScale }) => {
                plot.current = { bounds, xs: points.income.map(point => point.x) };
                const slot = points.income[1].x - points.income[0].x;
                return (
                  <>
                    <PlotBand bounds={bounds} width={slot * 0.9} x={points.income[current]?.x} />
                    <PlotGrid bounds={bounds} scale={yScale} ticks={ticks} font={null} format={() => ''} />
                    {points.income.map((income, i) => {
                      const spend = points.spend[i];
                      return income.yValue == null || spend.yValue == null
                        ? <RoundedRect key={data[i].key} x={income.x - slot / 4} y={bounds.bottom - 2}
                          width={slot / 2} height={2} r={1} color={color.chartTrack} />
                        : <BarPair key={i} bounds={bounds} income={income} spend={spend} series={series} index={i} slot={slot} />;
                    })}
                  </>
                );
              }}
            </CartesianChart>
          </View>}
      </ChartA11y>
      {hasData && <View style={{ flexDirection: 'row', gap: 12 }}>
        <LegendKey color={color.chartIncome} label="Income" />
        <LegendKey color={color.chartSpend} label="Spending" />
      </View>}
      {hasData && <ChartDataList label="cash flow data" rows={data.map((month, i) => ({
        key: month.key, text: cashFlowMonthLabel(month, i === current),
      }))} />}
    </>
  );
}
