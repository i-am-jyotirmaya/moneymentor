import type { Category, EventKind, PaymentChannel, Transaction, TransactionPatch, Visibility } from '../api/models';

export type TransactionEditForm = {
  amount: string; kind: EventKind; accountId: string | null; counterpartyAccountId: string | null;
  paymentChannel: PaymentChannel; categoryId: string | null; categoryName: string;
  merchantName: string; description: string; senderName: string; reason: string;
  transactionDate: string; visibility: Visibility;
};
export const isTransferKind = (kind: EventKind) => ['Transfer', 'CreditCardPayment', 'CashWithdrawal'].includes(kind);
export const isIncomeKind = (kind: EventKind) => ['Income', 'Cashback'].includes(kind);
export function toTransactionEditForm(t: Transaction): TransactionEditForm {
  return { amount: t.amount.toString(), kind: t.kind ?? (t.type === 'Expense' ? 'Purchase' : t.type),
    accountId: t.accountId ?? null, counterpartyAccountId: t.counterpartyAccountId ?? null,
    paymentChannel: t.paymentChannel ?? 'Unknown', categoryId: t.categoryId ?? null, categoryName: t.categoryName ?? '',
    merchantName: t.merchantName ?? '', description: t.description ?? '', senderName: t.senderName ?? '', reason: t.reason ?? '',
    transactionDate: t.transactionDate.slice(0, 10), visibility: t.visibility };
}
export function validateTransactionEdit(f: TransactionEditForm): string | null {
  const amount = Number(f.amount);
  if (!f.amount.trim() || !Number.isFinite(amount) || amount < 0.01 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return 'Enter a valid amount before saving the transaction.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.transactionDate) || !Number.isFinite(Date.parse(f.transactionDate)) || new Date(f.transactionDate).toISOString().slice(0, 10) !== f.transactionDate) return 'Enter a valid transaction date.';
  return null;
}
export function buildTransactionPatch(t: Transaction, f: TransactionEditForm): TransactionPatch {
  return { amount: Number(f.amount),
    ...(f.kind !== toTransactionEditForm(t).kind ? { kind: f.kind } : {}),
    ...(f.accountId !== (t.accountId ?? null) ? f.accountId ? { accountId: f.accountId } : { clearAccount: true } : {}),
    ...(f.counterpartyAccountId !== (t.counterpartyAccountId ?? null) ? f.counterpartyAccountId ? { counterpartyAccountId: f.counterpartyAccountId } : { clearCounterpartyAccount: true } : {}),
    ...(f.paymentChannel !== (t.paymentChannel ?? 'Unknown') ? { paymentChannel: f.paymentChannel } : {}),
    ...(f.categoryId && f.categoryId !== t.categoryId ? { categoryId: f.categoryId } : {}),
    ...(isIncomeKind(f.kind) ? { senderName: f.senderName, reason: f.reason } : { merchantName: f.merchantName, description: f.description }),
    transactionDate: f.transactionDate, visibility: f.visibility };
}
export type CategoryRow = { value: string; label: string; path: string; depth: number; selectable: boolean };
export function categoryRows(categories: Category[], income: boolean, query = ''): CategoryRow[] {
  const byId = new Map(categories.map(c => [c.id, c]));
  const available = categories.filter(c => c.type === (income ? 'Income' : 'Expense') && !c.isHidden && (!c.parentCategoryId || !byId.get(c.parentCategoryId)?.isHidden))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const ids = new Set(available.map(c => c.id));
  const groups = new Set(categories.map(c => c.parentCategoryId));
  const rows: CategoryRow[] = [];
  function visit(c: Category, ancestors: string[], seen: Set<string>) {
    if (seen.has(c.id)) return;
    const path = [...ancestors, c.name];
    rows.push({ value: c.id, label: c.name, path: path.join(' › '), depth: ancestors.length, selectable: !groups.has(c.id) });
    available.filter(child => child.parentCategoryId === c.id).forEach(child => visit(child, path, new Set([...seen, c.id])));
  }
  available.filter(c => !c.parentCategoryId || !ids.has(c.parentCategoryId)).forEach(c => visit(c, [], new Set()));
  const search = query.trim().toLocaleLowerCase();
  return search ? rows.filter(r => r.path.toLocaleLowerCase().includes(search) || rows.some(child => child.path.startsWith(`${r.path} › `) && child.path.toLocaleLowerCase().includes(search))) : rows;
}
