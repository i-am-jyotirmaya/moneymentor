import { monthlyFlowBars } from '../src/workspace/dashboard-data';

test('monthly cash-flow bars use absolute amounts on a common scale', () => {
  expect(monthlyFlowBars(1000, 250)).toEqual({
    hasNegative: false,
    entries: [{ label: 'Income', amount: 1000, percent: 100 }, { label: 'Spends', amount: 250, percent: 25 }],
  });
});
test('empty cash flow has no bars, and net refunds retain their sign', () => {
  expect(monthlyFlowBars(0, 0).entries.map(row => row.percent)).toEqual([0, 0]);
  expect(monthlyFlowBars(100, -50)).toEqual({
    hasNegative: true,
    entries: [{ label: 'Income', amount: 100, percent: 100 }, { label: 'Spends', amount: -50, percent: 50 }],
  });
});
