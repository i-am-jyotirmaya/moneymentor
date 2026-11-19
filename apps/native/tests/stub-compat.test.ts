import { existsSync, readFileSync } from 'node:fs';
import { createElement, type ComponentProps } from 'react';
import type { Transaction } from '../src/api/models';
import * as ui from '../src/ui';
import { lightTheme } from '../src/ui/theme';

// These tests check exports and props without mounting native charts.
jest.mock('@shopify/react-native-skia', () => ({}));
jest.mock('victory-native', () => ({}));
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('react-native-worklets', () => ({}));

const stubIndex = '/workspace/spndrr/proof/a2/b2-stubs/index.ts';
const expected = [
  'useThemedStyles', 'PressableScale', 'Card', 'Icon', 'CountUp', 'inrWorklet', 'QuickAction',
  'Chip', 'FilterChips', 'Segmented', 'TxRow', 'CategoryIcon', 'categoryIndex', 'signedAmount',
  'txKind', 'EmptyState', 'HeroCard', 'heroBackground',
  'CashFlowBars', 'CategoryDonut', 'GoalRing', 'SavingsArea', 'SliceGauge', 'donutRows',
  'savingsPoints', 'donutLegendPlacement', 'CategoryPlanList', 'GoalProjection', 'ChartA11y',
] as const satisfies readonly (keyof typeof ui)[];

test.each(expected)('exports %s from the native UI barrel', name => {
  expect(ui).toHaveProperty(name, expect.any(Function));
});

const testStubIndex = existsSync(stubIndex) ? test : test.skip;
testStubIndex('exports every runtime name from the B2 stub index (requires the local proof copy)', () => {
  const source = readFileSync(stubIndex, 'utf8');
  const exports = [...source.matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)];
  expect(exports.length).toBeGreaterThan(0);
  for (const [, names] of exports) {
    for (const entry of names.split(',').map(name => name.trim()).filter(Boolean)) {
      if (entry.startsWith('type ')) continue;
      expect(ui).toHaveProperty(entry, expect.any(Function));
    }
  }
});

const tx: Transaction = {
  id: 'transaction', householdId: 'household', userProfileId: null, amount: 1200, currencyCode: 'INR',
  type: 'Expense', categoryName: 'Food', merchantName: null, description: null, sourceText: 'Lunch',
  transactionDate: '2026-11-19', inputMode: 'Text', confidence: 1, visibility: 'Private',
  createdAt: '2026-11-19', updatedAt: '2026-11-19',
};

test('accepts B2 props through the barrel', () => {
  const icon: ui.IconName = { android: 'add', ios: 'plus' };
  const pill: ui.HeroPill = { icon, label: 'In', value: '₹1' };
  const pressable: ui.PressableScaleProps = {
    style: { backgroundColor: lightTheme.color.surface, padding: 4, borderRadius: 8 },
  };
  const onPress = () => {};
  const select = (_key: 'in' | 'out') => {};
  const options = [{ key: 'in', label: 'In' }, { key: 'out', label: 'Out' }] as const;
  const card = { children: null, testID: 'card', style: { gap: 12 } };
  const elements = [
    createElement(ui.HeroCard, { label: 'x', value: 1, a11ySummary: 's', pills: [pill] }),
    createElement(ui.Icon, { name: icon, color: lightTheme.color.onHero }),
    createElement(ui.PressableScale, pressable),
    createElement(ui.Card, card),
    createElement(ui.CountUp, { value: 1, accessibilityLabel: 'one', style: { margin: 0 }, testID: 'count' }),
    createElement(ui.QuickAction, { icon, label: 'In', onPress, testID: 'quick' }),
    createElement(ui.Chip, { label: 'In', count: 1, onPress, testID: 'chip' }),
    createElement(ui.FilterChips<'in' | 'out'>, { options: [...options], value: 'in', onChange: select, testID: 'filter' }),
    createElement(ui.Segmented<'in' | 'out'>, { options: [...options], value: 'in', onChange: select, label: 'Flow' }),
    createElement(ui.TxRow, { tx, testID: 'transaction' }),
    createElement(ui.CategoryIcon, { category: 'Groceries', kind: 'cat' }),
    createElement(ui.EmptyState, { icon, title: 'Empty', body: 'Add an expense', action: { label: 'Add', onPress } }),
  ];
  expect(elements).toHaveLength(12);
});

test('rounds signed rupees like the stub', () => {
  expect(ui.inrWorklet(-0.4, 'always')).toBe('₹0');
  expect(ui.inrWorklet(0.4, 'always')).toBe('+₹0');
  expect(ui.inrWorklet(-123456.5)).toBe('−₹1,23,457');
});


test('maps category names and transaction signs like the stub', () => {
  expect(ui.categoryIndex(null)).toBe(7);
  expect(ui.categoryIndex('Food')).toBe(4);
  expect(ui.txKind(tx)).toBe('cat');
  expect(ui.txKind({ type: 'Income' })).toBe('income');
  expect(ui.txKind({ type: 'Transfer' })).toBe('transfer');
  expect(ui.signedAmount(tx)).toBe(-1200);
  expect(ui.signedAmount({ ...tx, type: 'Income' })).toBe(1200);
  expect(ui.signedAmount({ ...tx, type: 'Transfer' })).toBe(0);
});

type TrendPoint = {
  key: string; label: string; income: number | null; spend: number | null;
  saved: number | null; savingsRate: number | null;
};

test('accepts the B2 chart props and monthly trend output through the barrel', () => {
  const months: TrendPoint[] = [
    { key: '2026-10', label: 'Oct', income: null, spend: null, saved: null, savingsRate: null },
    { key: '2026-11', label: 'Nov', income: 1000, spend: 600, saved: 400, savingsRate: 40 },
  ];
  const cashFlowMonths: ComponentProps<typeof ui.CashFlowBars>['months'] = months;
  const slices: ui.DonutSlice[] = [{ id: 'food', name: 'Food', amount: 600 }];
  const status: ui.GoalStatus = 'feasible';
  const elements = [
    createElement(ui.CashFlowBars, { months: cashFlowMonths, selected: '2026-11' }),
    createElement(ui.CategoryDonut, { slices, total: 600, colorFor: () => '#222222' }),
    createElement(ui.GoalRing, { progress: 0.4, status }),
    createElement(ui.SavingsArea, { points: ui.savingsPoints(months), baseline: { value: 30, label: 'Target' } }),
    createElement(ui.SliceGauge, { rate: 40 }),
  ];
  expect(elements).toHaveLength(5);
});
