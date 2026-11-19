import {
  axisLabelStride, cashFlowSummary, collapseSlices, donutLegendPlacement, donutRows, donutSummary, goalRingColor, goalRingLabel,
  nearestIndex, niceTicks, savingsBaseline, savingsPoints, savingsRate, savingsSummary, sliceGaugeLabel, sliceGeometry,
} from '../src/ui/charts/chartMath';

test('nice ticks round up and use at most four gridlines', () => {
  expect(niceTicks(144_000)).toEqual([0, 50_000, 100_000, 150_000]);
  expect(niceTicks(6, 9)).toEqual([0, 2, 4, 6]);
  expect(niceTicks(7)).toEqual([0, 2.5, 5, 7.5]);
  expect(niceTicks(0)).toEqual([0]);
});

test('the donut keeps five slices and preserves amount and budget in Other', () => {
  const input = Array.from({ length: 7 }, (_, i) => ({
    id: String(i), name: `Category ${i}`, amount: i + 1, budget: (i + 1) * 2,
  }));
  const result = collapseSlices(input);
  expect(result.map(slice => slice.name)).toEqual([
    'Category 6', 'Category 5', 'Category 4', 'Category 3', 'Category 2', 'Other (2)',
  ]);
  expect(result.at(-1)).toEqual({ id: 'other', name: 'Other (2)', amount: 3, budget: 6, colorIndex: 7, hatch: true });
  expect(result.reduce((sum, slice) => sum + slice.amount, 0)).toBe(28);
  expect(result.reduce((sum, slice) => sum + (slice.budget ?? 0), 0)).toBe(56);
});

const data = [39, null, 44.4, 39, 40.5, 45.2].map((rate, index) => ({
  key: `2026-${String(index + 6).padStart(2, '0')}`, label: '', rate,
}));

test('the savings baseline uses the latest three non-null preceding months or the report', () => {
  expect(savingsBaseline(data)?.value).toBeCloseTo(41.3);
  expect(savingsBaseline(data)?.label).toBe('3-mo avg');
  expect(savingsBaseline(data, { value: 25, label: 'Report' })).toEqual({ value: 25, label: 'Report' });
  expect(savingsBaseline([])).toBeNull();
  expect(savingsRate(100, 55)).toBe(45);
  expect(savingsRate(100, 108)).toBe(-8);
  expect(savingsRate(0, 50)).toBeNull();
});

test('axis label stride and nearest datum handle their boundary cases', () => {
  expect([1, 1.29, 1.3, 2].map(axisLabelStride)).toEqual([1, 1, 2, 2]);
  expect(nearestIndex(13, [0, 10, 20])).toBe(1);
  expect(nearestIndex(15, [0, 10, 20])).toBe(1);
  expect(nearestIndex(-1, [])).toBe(-1);
});

test('the Slice arc starts at twelve o’clock and a deficit leaves the track empty', () => {
  expect(sliceGeometry(-8)).toEqual({ cx: 47, cy: 53, radius: 41, startAngle: -90, sweepAngle: 0 });
  expect(sliceGeometry(45).sweepAngle).toBe(162);
  expect(sliceGeometry(160).sweepAngle).toBe(360);
});

test('goal ring colors follow the status table', () => {
  expect(goalRingColor('feasible')).toBe('primary');
  expect(goalRingColor('stretch')).toBe('warning');
  expect(goalRingColor('behind')).toBe('warning');
  expect(goalRingColor('completed')).toBe('income');
  expect(goalRingColor('new')).toBe('chartTrack');
});

test('cash flow summary names both series, net, and the highest-spending month', () => {
  const months = data.map((point, i) => ({ ...point, income: 124_500, spend: [70_000, 71_000, 82_450, 72_000, 74_120, 68_240][i] }));
  expect(cashFlowSummary(months)).toBe(
    'Cash flow, last 6 months. November so far: in ₹1,24,500, out ₹68,240, net plus ₹56,260. Highest spending August, ₹82,450.',
  );
  expect(cashFlowSummary([])).toBe('Cash flow. Your charts start with one entry.');
});

test('donut summary names shares, amounts and over-plan amounts', () => {
  expect(donutSummary([
    { id: 'rent', name: 'Rent', amount: 22_000 },
    { id: 'groceries', name: 'Groceries', amount: 14_820 },
    { id: 'dining', name: 'Dining out', amount: 8460, budget: 8000 },
  ], 68_240, '2026-11')).toBe(
    'Spending by category, November. Rent 32 percent, ₹22,000. Groceries 22 percent, ₹14,820. Dining out 12 percent, ₹8,460, over plan by ₹460.',
  );
  expect(donutSummary([], 0, '2026-11')).toBe('Spending by category, November. No spending yet.');
});

test('savings, goal and gauge summaries use the specified spoken figures', () => {
  expect(savingsSummary(data, savingsBaseline(data))).toBe(
    'Savings rate, June to November. November 45.2 percent, up 4.7 points on October. 3-month average 41.3 percent.',
  );
  expect(goalRingLabel(0.62, 'feasible', {
    name: 'Emergency fund', current: 186_000, target: 300_000, targetMonth: '2027-06',
  })).toBe('Emergency fund, 62 percent, ₹1,86,000 of ₹3,00,000, on track for June 2027.');
  expect(sliceGaugeLabel(45)).toBe('You kept 45 percent of income this month');
  expect(sliceGaugeLabel(-8)).toBe('You had a deficit of 8 percent of income this month');
});

test('donut rows sort descending and combine the tail after five entries', () => {
  const slices = [1, 6, 3, 7, 2, 5, 4].map(amount => ({
    id: String(amount), name: `Category ${amount}`, amount, budget: amount * 2,
  }));
  expect(donutRows(slices)).toEqual([
    slices[3], slices[1], slices[5], slices[6], slices[2],
    { id: 'other', name: 'Other (2)', amount: 3 },
  ]);
  expect(slices.map(slice => slice.amount)).toEqual([1, 6, 3, 7, 2, 5, 4]);
  expect(donutRows(slices.slice(0, 2))).toEqual([slices[1], slices[0]]);
  expect(donutRows([])).toEqual([]);
});

test('donut legend moves below the chart at font scale 1.5', () => {
  expect([1, 1.49, 1.5, 2].map(donutLegendPlacement)).toEqual(['side', 'side', 'below', 'below']);
});

test('savings points keep month order and preserve null, zero and deficit rates', () => {
  const months = [null, 0, -12, 40].map((savingsRate, index) => ({
    key: `2026-0${index + 1}`, label: ['Jan', 'Feb', 'Mar', 'Apr'][index],
    income: 1000, savingsRate,
  }));
  expect(savingsPoints(months)).toEqual([
    { key: '2026-01', label: 'Jan', rate: null },
    { key: '2026-02', label: 'Feb', rate: 0 },
    { key: '2026-03', label: 'Mar', rate: -12 },
    { key: '2026-04', label: 'Apr', rate: 40 },
  ]);
});
