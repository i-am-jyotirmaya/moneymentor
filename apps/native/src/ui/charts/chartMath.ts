import { formatMonthKey, spokenInr } from '../../lib/format';

export type TrendMonth = { key: string; label: string; income: number | null; spend: number | null };
export type SavingsPoint = { key: string; label: string; rate: number | null };
export type SavingsBaseline = { value: number; label: string };
export type DonutSlice = { id: string; name: string; amount: number; budget?: number | null };
export type GoalStatus = 'feasible' | 'stretch' | 'behind' | 'completed' | 'new';

export function niceTicks(max: number, count = 4): number[] {
  const ticks = Math.min(4, Math.max(1, Math.floor(count)));
  if (ticks === 1 || !Number.isFinite(max) || max <= 0) return [0];
  const rough = max / (ticks - 1);
  const power = 10 ** Math.floor(Math.log10(rough));
  const multiple = [1, 2, 2.5, 5, 10].find(value => value * power >= rough) ?? 10;
  return Array.from({ length: ticks }, (_, i) => Number((i * multiple * power).toPrecision(12)));
}

export function categoryIndex(id: string, slots = 6) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = Math.imul(31, hash) + id.charCodeAt(i) | 0;
  return (hash >>> 0) % slots;
}

export function categoryColors(slices: readonly DonutSlice[], slots = 6) {
  const colors = new Map<string, number>();
  const used = new Set<number>();
  // The chart props carry identity but no creation timestamps. Resolve collisions in ID order
  // so a ranking change with the same categories cannot change their colours.
  for (const id of [...new Set(slices.map(slice => slice.id))].sort()) {
    let index = categoryIndex(id, slots);
    while (used.size < slots && used.has(index)) index = (index + 1) % slots;
    colors.set(id, index);
    used.add(index);
  }
  return colors;
}

export function donutRows(slices: readonly DonutSlice[]): DonutSlice[] {
  const sorted = [...slices].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  return rest.length ? [...top, {
    id: 'other',
    name: `Other (${rest.length})`,
    amount: rest.reduce((sum, slice) => sum + slice.amount, 0),
  }] : top;
}

export function donutLegendPlacement(fontScale: number): 'side' | 'below' {
  return fontScale >= 1.5 ? 'below' : 'side';
}

export function savingsPoints(months: readonly { key: string; label: string; savingsRate: number | null }[]): SavingsPoint[] {
  return months.map(({ key, label, savingsRate }) => ({ key, label, rate: savingsRate }));
}

export function collapseSlices(slices: readonly DonutSlice[], top = 5) {
  const sorted = [...slices].sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, top);
  const tail = sorted.slice(top);
  const colors = categoryColors(head);
  const result = head.map(slice => ({ ...slice, colorIndex: colors.get(slice.id)!, hatch: false }));
  if (tail.length) result.push({
    id: 'other', name: `Other (${tail.length})`,
    amount: tail.reduce((sum, slice) => sum + slice.amount, 0),
    budget: tail.some(slice => slice.budget != null)
      ? tail.reduce((sum, slice) => sum + (slice.budget ?? 0), 0) : undefined,
    colorIndex: 7, hatch: true,
  });
  return result;
}

export function savingsRate(income: number, spend: number) {
  return income > 0 ? (income - spend) / income * 100 : null;
}

export function savingsBaseline(points: readonly SavingsPoint[], reportBaseline?: SavingsBaseline | number | null) {
  if (typeof reportBaseline === 'number') return { value: reportBaseline, label: 'Baseline' };
  if (reportBaseline) return reportBaseline;
  const previous = points.slice(0, -1).flatMap(point => point.rate == null ? [] : [point.rate]).slice(-3);
  return previous.length
    ? { value: previous.reduce((sum, rate) => sum + rate, 0) / previous.length, label: '3-mo avg' }
    : null;
}

export function axisLabelStride(fontScale: number) {
  return fontScale >= 1.3 ? 2 : 1;
}

export function nearestIndex(x: number, xs: readonly number[]) {
  let nearest = -1;
  let distance = Infinity;
  xs.forEach((position, index) => {
    const delta = Math.abs(x - position);
    if (delta < distance) {
      nearest = index;
      distance = delta;
    }
  });
  return nearest;
}

export function sliceGeometry(rate: number) {
  return { cx: 47, cy: 53, radius: 41, startAngle: -90, sweepAngle: 360 * Math.max(0, Math.min(1, rate / 100)) };
}

export function goalRingColor(status: GoalStatus) {
  switch (status) {
    case 'new': return 'chartTrack';
    case 'completed': return 'income';
    case 'stretch':
    case 'behind': return 'warning';
    case 'feasible': return 'primary';
  }
}

export function fullMonth(key: string) {
  return formatMonthKey(key).replace(/\s\d{4}$/, '');
}

export function percentText(value: number) {
  return (Math.round(value * 10) / 10).toString().replace('-', '−');
}

export function cashFlowMonthLabel(month: TrendMonth, current = false) {
  const name = fullMonth(month.key) + (current ? ' so far' : '');
  const { income, spend } = month;
  if (income == null || spend == null) return `${name}: no data.`;
  return `${name}: in ${spokenInr(income)}, out ${spokenInr(spend)}, net ${spokenInr(income - spend, { sign: 'always' })}.`;
}

export function cashFlowSummary(months: readonly TrendMonth[]) {
  const last = months.at(-1);
  if (!last || !months.some(month => month.income != null && month.spend != null)) {
    return 'Cash flow. Your charts start with one entry.';
  }
  const highest = months.reduce<TrendMonth | undefined>((best, month) =>
    month.spend != null && (!best || month.spend > best.spend!) ? month : best, undefined);
  return `Cash flow, last ${months.length} months. ${cashFlowMonthLabel(last, true)}`
    + (highest ? ` Highest spending ${fullMonth(highest.key)}, ${spokenInr(highest.spend!)}.` : '');
}

export function categoryLabel(slice: DonutSlice, total: number) {
  const share = total > 0 ? slice.amount / total * 100 : 0;
  const over = slice.budget == null ? 0 : slice.amount - slice.budget;
  return `${slice.name} ${share > 0 && share < 2 ? 'less than 1' : Math.round(share)} percent, ${spokenInr(slice.amount)}`
    + (over > 0 ? `, over plan by ${spokenInr(over)}.` : '.');
}

export function donutSummary(slices: readonly DonutSlice[], total: number, month?: string) {
  const title = `Spending by category${month ? `, ${fullMonth(month)}` : ''}.`;
  return total > 0 ? `${title} ${slices.map(slice => categoryLabel(slice, total)).join(' ')}` : `${title} No spending yet.`;
}

export function savingsSummary(points: readonly SavingsPoint[], baseline?: SavingsBaseline | null) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 'Savings rate. No data.';
  const previous = points.at(-2);
  const delta = last.rate != null && previous?.rate != null ? last.rate - previous.rate : 0;
  const name = fullMonth(last.key);
  const latest = last.rate == null ? `${name}, no data.` :
    `${name} ${percentText(last.rate)} percent${delta && previous ? `, ${delta > 0 ? 'up' : 'down'} ${percentText(Math.abs(delta))} points on ${fullMonth(previous.key)}` : ''}.`;
  const average = baseline?.label === '3-mo avg' ? '3-month average' : baseline?.label;
  return `Savings rate, ${fullMonth(first.key)} to ${name}. ${latest}`
    + (baseline ? ` ${average} ${percentText(baseline.value)} percent.` : '');
}

export function goalRingLabel(progress: number, status: GoalStatus, details?: {
  name: string; current: number; target: number; targetMonth?: string;
}) {
  const statusText = { feasible: 'on track', stretch: 'stretch', behind: 'behind', completed: 'completed', new: 'new' }[status];
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  if (!details) return `Goal progress, ${percent} percent, ${statusText}.`;
  return `${details.name}, ${percent} percent, ${spokenInr(details.current)} of ${spokenInr(details.target)}, ${statusText}`
    + (details.targetMonth ? ` for ${formatMonthKey(details.targetMonth)}.` : '.');
}

export function sliceGaugeLabel(rate: number) {
  return rate < 0
    ? `You had a deficit of ${percentText(-rate)} percent of income this month`
    : `You kept ${percentText(rate)} percent of income this month`;
}
