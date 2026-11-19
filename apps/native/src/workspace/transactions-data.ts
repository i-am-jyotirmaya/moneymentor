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

// --- Cobalt Slice transactions list (B2) -----------------------------------------------------
export type TxFilter = 'all' | 'expenses' | 'income' | 'transfers';
export function matchesFilter(t: Transaction, filter: TxFilter) {
  if (filter === 'all') return true;
  if (filter === 'income') return t.type === 'Income';
  if (filter === 'transfers') return t.type === 'Transfer';
  return t.type === 'Expense' || t.type === 'Investment';
}
export function filterCounts(items: Transaction[]) {
  return { all: items.length, expenses: items.filter(t => matchesFilter(t, 'expenses')).length,
    income: items.filter(t => matchesFilter(t, 'income')).length, transfers: items.filter(t => matchesFilter(t, 'transfers')).length };
}
/** Signed day impact: income +, spend −, transfers neutral. */
export function signedImpact(t: Transaction) {
  if (t.type === 'Transfer') return 0;
  return t.type === 'Income' ? Math.abs(t.amount) : -Math.abs(t.amount);
}
export function dayKey(value: string) { return value.slice(0, 10); }
export function dayLabel(key: string, today: string) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - date.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}
/** Newest day first, preserving the API's order inside a day. */
export function groupByDay(items: Transaction[], today: string) {
  const groups = new Map<string, Transaction[]>();
  for (const t of items) {
    const key = dayKey(t.transactionDate);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, list]) => ({
    key, label: dayLabel(key, today), total: list.reduce((sum, t) => sum + signedImpact(t), 0), items: list,
  }));
}
