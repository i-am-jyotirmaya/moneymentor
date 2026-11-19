// TODO(A3): stand-ins for src/ui/charts/* (Skia / victory-native). Same props as HANDOFF A3,
// drawn with plain Views so B2 can ship layout, sizing and a11y before A3 lands.
import { Text, View } from 'react-native';
import { formatInr } from '../../lib/format';
import { useTheme } from '../ThemeProvider';

/** Ring drawn from overlapping dots: round caps, 12 o'clock start, clockwise. */
export function DotRing({ size, stroke, progress, color, track }: { size: number; stroke: number; progress: number; color: string; track: string }) {
  const n = Math.max(36, Math.round(size * 1.1));
  const r = (size - stroke) / 2;
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * n);
  return <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
    {Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return <View key={i} style={{ position: 'absolute', width: stroke, height: stroke, borderRadius: stroke / 2,
        left: size / 2 + r * Math.cos(a) - stroke / 2, top: size / 2 + r * Math.sin(a) - stroke / 2, backgroundColor: i < filled ? color : track }} />;
    })}
  </View>;
}

export function SliceGauge({ rate, size = 92 }: { rate: number; size?: number }) {
  const { color, type } = useTheme();
  const deficit = rate < 0;
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute' }}><DotRing size={size} stroke={Math.round(size * 0.13)} progress={deficit ? 0 : rate / 100} color={color.onHero} track="rgba(255,255,255,0.22)" /></View>
    <Text maxFontSizeMultiplier={1.3} style={[type.title, { color: color.onHero, fontFamily: 'InterTight_700Bold' }]}>{deficit ? '−' : ''}{Math.abs(Math.round(rate))}%</Text>
    <Text maxFontSizeMultiplier={1.3} style={[type.overline, { color: color.onHeroMuted }]}>{deficit ? 'Deficit' : 'Kept'}</Text>
  </View>;
}

export type GoalStatus = 'feasible' | 'stretch' | 'behind' | 'completed' | 'new';
export function GoalRing({ progress, status, size = 64, showLabel = true }: { progress: number; status: GoalStatus; size?: 44 | 64 | 120; showLabel?: boolean }) {
  const { color, type } = useTheme();
  const tint = status === 'completed' ? color.income : status === 'stretch' || status === 'behind' ? color.warning : color.primary;
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ position: 'absolute' }}><DotRing size={size} stroke={size >= 120 ? 12 : 6} progress={status === 'new' ? 0 : progress} color={tint} track={color.chartTrack} /></View>
    {showLabel ? <Text maxFontSizeMultiplier={1.2} style={[type.labelS, { color: color.text }]}>{status === 'completed' ? '✓' : `${Math.round(progress * 100)}%`}</Text> : null}
  </View>;
}

export type TrendMonth = { key: string; label: string; income: number | null; spend: number | null };
export function CashFlowBars({ months, selected, height = 170 }: { months: TrendMonth[]; selected?: string; height?: number }) {
  const { color, type } = useTheme();
  const max = Math.max(1, ...months.flatMap(m => [m.income ?? 0, m.spend ?? 0]));
  const plot = height - 24;
  const w = months.length > 6 ? 6 : 12;
  const bar = (value: number | null, tint: string) => <View style={{ width: w, height: value ? Math.max(3, (value / max) * plot) : 3, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: value === null ? color.chartTrack : tint }} />;
  return <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
    {months.map(m => <View key={m.key} style={{ alignItems: 'center', gap: 6, flex: 1, borderRadius: 8, paddingTop: 4, backgroundColor: m.key === selected ? color.surfaceTonal : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: months.length > 6 ? 2 : 4, height: plot }}>{bar(m.income, color.chartIncome)}{bar(m.spend, color.chartSpend)}</View>
      <Text maxFontSizeMultiplier={1.3} style={[type.caption, { color: m.key === selected ? color.text : color.chartAxis, fontFamily: m.key === selected ? 'Inter_700Bold' : undefined }]}>{months.length > 6 ? m.label.slice(0, 1) : m.label}</Text>
    </View>)}
  </View>;
}

export type DonutSlice = { id: string; name: string; amount: number; budget?: number | null };
/** Collapses everything after the top 5 into "Other (n)", per charts.md. */
export function donutRows(slices: DonutSlice[]) {
  const sorted = [...slices].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  return rest.length ? [...top, { id: 'other', name: `Other (${rest.length})`, amount: rest.reduce((sum, s) => sum + s.amount, 0) }] : top;
}
export function CategoryDonut({ slices, total, size = 150, centerLabel = 'Spent', colorFor }: { slices: DonutSlice[]; total: number; size?: number; centerLabel?: string; colorFor: (slice: DonutSlice) => string }) {
  const { color, type } = useTheme();
  const rows = donutRows(slices);
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {/* TODO(A3): segmented Skia donut; this stand-in draws one ring per share, stacked in order. */}
    <View style={{ position: 'absolute' }}><DotRing size={size} stroke={16} progress={1} color={color.chartTrack} track={color.chartTrack} /></View>
    {rows.reduce<{ start: number; nodes: React.ReactNode[] }>((acc, row) => {
      const share = total > 0 ? row.amount / total : 0;
      acc.nodes.push(<View key={row.id} style={{ position: 'absolute', transform: [{ rotate: `${acc.start * 360}deg` }] }}><DotRing size={size} stroke={16} progress={share} color={colorFor(row)} track="transparent" /></View>);
      acc.start += share;
      return acc;
    }, { start: 0, nodes: [] }).nodes}
    <Text style={[type.overline, { color: color.text2 }]}>{centerLabel}</Text>
    <Text maxFontSizeMultiplier={1.3} style={[type.title, { color: color.text, fontFamily: 'InterTight_700Bold' }]}>{formatInr(total, { compact: total >= 100000 })}</Text>
  </View>;
}

export function SavingsArea({ points, height = 140 }: { points: { key: string; label: string; rate: number | null }[]; height?: number }) {
  const { color, type } = useTheme();
  const max = Math.max(10, ...points.map(p => Math.abs(p.rate ?? 0)));
  const plot = height - 24;
  return <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
    {points.map((p, i) => <View key={p.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <View style={{ height: plot, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
        <View style={{ width: '70%', height: p.rate === null ? 3 : Math.max(3, (Math.abs(p.rate) / max) * plot), borderTopLeftRadius: 6, borderTopRightRadius: 6,
          backgroundColor: p.rate === null ? color.chartTrack : (p.rate ?? 0) < 0 ? color.negativeContainer : `${color.chartSpend}${i === points.length - 1 ? 'FF' : '55'}` }} />
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[type.caption, { color: color.chartAxis }]}>{p.label}</Text>
    </View>)}
  </View>;
}
