import type { Transaction } from '../api/models';
export function categoryPercent(amount: number, total: number) {
  return total > 0 ? Math.round(amount / total * 100) : 0;
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
