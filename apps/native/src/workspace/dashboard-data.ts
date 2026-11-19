import type { CategorySpendSummary, Goal } from '../api/workspace-models';
import { formatMonthKey } from '../lib/format';
import type { Transaction } from '../api/models';
export function categoryPercent(amount: number, total: number) {
  return total > 0 ? Math.round(amount / total * 100) : 0;
}
// Only compare complete monthly totals. Recent transactions are a partial list
// and cannot represent a daily spending series.
export function monthlyFlowBars(income: number, spends: number) {
  const entries = [{ label: 'Income', amount: income }, { label: 'Spends', amount: spends }] as const;
  const max = Math.max(Math.abs(income), Math.abs(spends));
  return {
    hasNegative: income < 0 || spends < 0,
    entries: entries.map(entry => ({ ...entry, percent: max > 0 ? Math.abs(entry.amount) / max * 100 : 0 })),
  };
}
export function transactionPresentation(transaction: Transaction) {
  const income = transaction.type === 'Income';
  const impact = transaction.financialImpact;
  const credit = impact ? impact.spending < 0 || impact.income > 0 || impact.rewards > 0 : income;
  const neutral = impact ? impact.spending === 0 && impact.income === 0 && impact.investment === 0 && impact.rewards === 0 : transaction.type === 'Transfer';
  return {
    label: income ? transaction.reason ?? (transaction.senderName ? `Income from ${transaction.senderName}` : transaction.sourceText) : transaction.description ?? transaction.merchantName ?? transaction.sourceText,
    sign: neutral ? '↔ ' : credit ? '+' : '-',
    income,
  };
}

// --- Cobalt Slice dashboard (B2) -------------------------------------------------------------

/** "November so far" for the running month, "October 2026" for a closed one. */
export function heroLabel(month: string, current: string) {
  const full = formatMonthKey(month);
  return month === current ? `${full.split(' ')[0]} so far` : full;
}
/** Savings-rate change against the previous month, in percentage points. */
export function savingsDelta(points: { key: string; savingsRate: number | null }[], month: string) {
  const index = points.findIndex(p => p.key === month);
  const now = points[index]?.savingsRate;
  const before = index > 0 ? points[index - 1] : undefined;
  if (now === null || now === undefined || before?.savingsRate === null || before?.savingsRate === undefined) return undefined;
  const diff = Math.round((now - before.savingsRate) * 10) / 10;
  const previous = formatMonthKey(before.key).split(' ')[0];
  if (diff === 0) return { text: `Same savings rate as ${previous}`, direction: 'flat' as const };
  return { text: `${diff > 0 ? '+' : '−'}${Math.abs(diff)} pts vs ${previous}`, direction: diff > 0 ? 'up' as const : 'down' as const };
}
export function goalRingStatus(goal: Pick<Goal, 'status' | 'currentAmount' | 'targetAmount' | 'requiredMonthlyContribution' | 'projectedMonthlyPace'>) {
  if (goal.status === 'Completed' || (goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount)) return 'completed' as const;
  if (goal.currentAmount <= 0) return 'new' as const;
  const need = goal.requiredMonthlyContribution;
  const pace = goal.projectedMonthlyPace;
  if (need !== null && pace !== null && pace < need) return 'behind' as const;
  return 'feasible' as const;
}
export function goalProgress(goal: Pick<Goal, 'currentAmount' | 'targetAmount'>) {
  return goal.targetAmount > 0 ? Math.min(1, Math.max(0, goal.currentAmount / goal.targetAmount)) : 0;
}
/** Expense categories only (charts.md Chart 2), sorted by amount. */
export function expenseSlices(categories: CategorySpendSummary[]) {
  return categories
    .filter(c => !/^(income|transfer)/i.test(c.classification ?? ''))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map(c => ({ id: c.name, name: c.name, amount: c.amount, budget: c.budget }));
}
