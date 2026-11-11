import { formatDate, formatMoney, formatMonthKey, formatTone, getCurrentMonthKey, getMonthOptions, shiftMonthKey } from '../src/lib/format';
import { bottomLabel, bottomSections, sectionLabel, sections } from '../src/workspace/navigation';
import { categoryPercent, transactionPresentation } from '../src/workspace/dashboard-data';
import type { Transaction } from '../src/api/models';

test('money follows en-IN grouping, fractional and fallback formatting', () => {
  expect(formatMoney(123456, 'INR')).toBe('₹1,23,456');
  expect(formatMoney(12.5, 'INR')).toBe('₹12.50');
  expect(formatMoney(-12, 'USD')).toBe('-$12');
  expect(formatMoney(12.5, 'invalid')).toBe('invalid 12.50');
});
test('date formatting and invalid date fallback match web', () => {
  expect(formatDate('2026-11-10')).toBe('10 Nov 2026');
  expect(formatDate('invalid')).toBe('invalid');
  expect(formatTone('NeedsAttention')).toBe('Needs Attention');
});
test('month navigation crosses years and retains selected months outside the 36 month window', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-11T12:00:00Z'));
  try {
    expect(getCurrentMonthKey()).toBe('2026-11');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(formatMonthKey('2026-01')).toBe('January 2026');
    expect(getMonthOptions('2026-10')).toHaveLength(36);
    const options = getMonthOptions('2020-01');
    expect(options).toHaveLength(37);
    expect(options[0]).toBe('2026-11');
    expect(options.at(-1)).toBe('2020-01');
  } finally { jest.useRealTimers(); }
});
test('mobile nav order, Track label, menu sections and report spelling match web', () => {
  expect(bottomSections.map(bottomLabel)).toEqual(['Track', 'Transactions', 'Dashboard']);
  expect(sections.map(item => item.label)).toEqual(['Dashboard', 'Assistant', 'Transactions', 'Judgments', 'Planning', 'Household', 'Settings']);
  expect(sectionLabel('reports')).toBe('Judgments');
  expect(sectionLabel('unknown')).toBe('Dashboard');
});
test('category percentages handle empty totals and round like web', () => {
  expect(categoryPercent(1, 3)).toBe(33);
  expect(categoryPercent(20, 0)).toBe(0);
  expect(categoryPercent(120, 100)).toBe(120);
});
test('transaction presentation respects credits, transfers and income source fallback', () => {
  const base = { type: 'Income', sourceText: 'received 50', senderName: 'Joe' } as Transaction;
  expect(transactionPresentation(base)).toMatchObject({ label: 'Income from Joe', sign: '+' });
  expect(transactionPresentation({ ...base, reason: 'Lunch refund' }).label).toBe('Lunch refund');
  expect(transactionPresentation({ ...base, type: 'Transfer' }).sign).toBe('↔ ');
  expect(transactionPresentation({ ...base, type: 'Expense', description: 'Coffee' })).toMatchObject({ label: 'Coffee', sign: '-' });
  expect(transactionPresentation({ ...base, type: 'Expense', financialImpact: { spending: -50, income: 0, investment: 0, rewards: 0 } }).sign).toBe('+');
});
