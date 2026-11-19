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
