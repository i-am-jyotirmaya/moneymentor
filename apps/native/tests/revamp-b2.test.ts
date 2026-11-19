import type { Transaction } from '../src/api/models';
import { donutRows } from '../src/ui/stubs/charts';
import { inrWorklet } from '../src/ui/stubs/inr';
import { hasConversation, initialAssistantMessages, userMessage } from '../src/workspace/assistant-data';
import { expenseSlices, goalProgress, goalRingStatus, heroLabel, savingsDelta } from '../src/workspace/dashboard-data';
import { CURRENT_MONTH_STALE_MS, isStale, monthlyKey, toTrendPoint, trendMonthKeys } from '../src/workspace/monthly-trend';
import { dayLabel, filterCounts, groupByDay, matchesFilter, signedImpact } from '../src/workspace/transactions-data';

const transaction: Transaction = { id: 't', householdId: 'home', userProfileId: null, amount: 180, currencyCode: 'INR', type: 'Expense', categoryId: 'snacks', categoryName: 'Snacks', merchantName: 'Zepto', description: null, sourceText: 'ice cream', transactionDate: '2026-11-10', inputMode: 'Text', confidence: 1, visibility: 'Private', createdAt: '', updatedAt: '' };
const tx = (id: string, type: Transaction['type'], amount: number, date: string): Transaction => ({ ...transaction, id, type, amount, transactionDate: date });

test('hero label reads "so far" only for the running month', () => {
  expect(heroLabel('2026-11', '2026-11')).toBe('November so far');
  expect(heroLabel('2026-10', '2026-11')).toBe('October 2026');
});
test('savings delta compares with the previous month in points', () => {
  const points = [{ key: '2026-10', savingsRate: 30 }, { key: '2026-11', savingsRate: 34.7 }];
  expect(savingsDelta(points, '2026-11')).toEqual({ text: '+4.7 pts vs October', direction: 'up' });
  expect(savingsDelta([{ key: '2026-10', savingsRate: 40 }, { key: '2026-11', savingsRate: 34.5 }], '2026-11')).toEqual({ text: '−5.5 pts vs October', direction: 'down' });
  expect(savingsDelta([{ key: '2026-10', savingsRate: 30 }, { key: '2026-11', savingsRate: 30 }], '2026-11')?.direction).toBe('flat');
  expect(savingsDelta([{ key: '2026-10', savingsRate: null }, { key: '2026-11', savingsRate: 30 }], '2026-11')).toBeUndefined();
  expect(savingsDelta(points, '2026-10')).toBeUndefined();
});
test('goal ring status and progress', () => {
  const base = { status: 'Active', currentAmount: 500, targetAmount: 1000, requiredMonthlyContribution: 100, projectedMonthlyPace: 150 } as Parameters<typeof goalRingStatus>[0];
  expect(goalRingStatus(base)).toBe('feasible');
  expect(goalRingStatus({ ...base, projectedMonthlyPace: 50 })).toBe('behind');
  expect(goalRingStatus({ ...base, currentAmount: 0 })).toBe('new');
  expect(goalRingStatus({ ...base, currentAmount: 1000 })).toBe('completed');
  expect(goalProgress({ currentAmount: 1500, targetAmount: 1000 })).toBe(1);
  expect(goalProgress({ currentAmount: 250, targetAmount: 1000 })).toBe(0.25);
  expect(goalProgress({ currentAmount: 250, targetAmount: 0 })).toBe(0);
});
test('expense slices drop income, transfers and zero rows, largest first', () => {
  const rows = expenseSlices([
    { name: 'Food', amount: 100, classification: 'Expense' }, { name: 'Salary', amount: 900, classification: 'Income' },
    { name: 'Rent', amount: 500, classification: 'Expense' }, { name: 'Moves', amount: 50, classification: 'Transfer' }, { name: 'Gym', amount: 0, classification: 'Expense' },
  ] as Parameters<typeof expenseSlices>[0]);
  expect(rows.map(r => r.name)).toEqual(['Rent', 'Food']);
});
test('donut collapses after the top five into Other', () => {
  const slices = [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: String(n), name: `C${n}`, amount: n }));
  const rows = donutRows(slices);
  expect(rows).toHaveLength(6);
  expect(rows[5]).toEqual({ id: 'other', name: 'Other (2)', amount: 3 });
  expect(donutRows(slices.slice(0, 3))).toHaveLength(3);
});
test('monthly trend keys, points and staleness', () => {
  expect(trendMonthKeys('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  expect(monthlyKey('home', '2026-11')).toBe('["dashboard","monthly","home","2026-11"]');
  expect(toTrendPoint('2026-11', null)).toEqual({ key: '2026-11', label: 'Nov', income: null, spend: null, saved: null, savingsRate: null });
  expect(isStale('2026-11', 0, CURRENT_MONTH_STALE_MS + 1, '2026-11')).toBe(true);
  expect(isStale('2026-10', 0, CURRENT_MONTH_STALE_MS + 1, '2026-11')).toBe(false);
});
test('count-up formatter matches Indian grouping and U+2212', () => {
  expect(inrWorklet(124500)).toBe('₹1,24,500');
  expect(inrWorklet(-1234567)).toBe('−₹12,34,567');
  expect(inrWorklet(500, 'always')).toBe('+₹500');
  expect(inrWorklet(0, 'always')).toBe('₹0');
  expect(inrWorklet(-0.2)).toBe('₹0');
});
test('transaction filters, day labels and day groups', () => {
  const items = [tx('a', 'Expense', 100, '2026-11-19T10:00:00Z'), tx('b', 'Income', 1000, '2026-11-18T09:00:00Z'), tx('c', 'Transfer', 50, '2026-11-19T08:00:00Z'), tx('d', 'Investment', 200, '2026-11-17T08:00:00Z')];
  expect(filterCounts(items)).toEqual({ all: 4, expenses: 2, income: 1, transfers: 1 });
  expect(items.filter(t => matchesFilter(t, 'expenses')).map(t => t.id)).toEqual(['a', 'd']);
  expect(signedImpact(items[1])).toBe(1000);
  expect(signedImpact(items[2])).toBe(0);
  expect(dayLabel('2026-11-19', '2026-11-19')).toBe('Today');
  expect(dayLabel('2026-11-18', '2026-11-19')).toBe('Yesterday');
  expect(dayLabel('2026-11-17', '2026-11-19')).toMatch(/Tue/);
  const groups = groupByDay(items, '2026-11-19');
  expect(groups.map(g => [g.key, g.label, g.total, g.items.map(t => t.id)])).toEqual([
    ['2026-11-19', 'Today', -100, ['a', 'c']], ['2026-11-18', 'Yesterday', 1000, ['b']], ['2026-11-17', expect.stringMatching(/17/), -200, ['d']],
  ]);
});
test('assistant empty state shows until the user sends something', () => {
  expect(hasConversation(initialAssistantMessages())).toBe(false);
  expect(hasConversation([...initialAssistantMessages(), userMessage('food 50')])).toBe(true);
});
