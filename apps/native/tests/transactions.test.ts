import { FinanceClient, type HttpRequest } from '../src/api/client';
import type { Category, Transaction } from '../src/api/models';
import { buildTransactionPatch, categoryRows, toTransactionEditForm, validateTransactionEdit } from '../src/workspace/transactions-data';

const transaction: Transaction = { id: 'record', householdId: 'home', userProfileId: null, amount: 180, currencyCode: 'INR', type: 'Expense', categoryId: 'snacks', categoryName: 'Snacks', merchantName: 'Zepto', description: null, sourceText: 'ice cream', transactionDate: '2026-11-10', inputMode: 'Text', confidence: 1, visibility: 'Private', createdAt: '', updatedAt: '' };
test('editor defaults match web and unchanged fields produce the web patch', () => {
  const form = toTransactionEditForm(transaction);
  expect(form).toMatchObject({ kind: 'Purchase', amount: '180', paymentChannel: 'Unknown', accountId: null, counterpartyAccountId: null, description: '', transactionDate: '2026-11-10' });
  expect(buildTransactionPatch(transaction, form)).toEqual({ amount: 180, merchantName: 'Zepto', description: '', transactionDate: '2026-11-10', visibility: 'Private' });
});
test('patch explicitly clears accounts and sends only changed classification fields', () => {
  const original = { ...transaction, accountId: 'bank', counterpartyAccountId: 'wallet' };
  const form = { ...toTransactionEditForm(original), kind: 'Cashback' as const, accountId: null, counterpartyAccountId: null, paymentChannel: 'UPI' as const, categoryId: 'income', senderName: 'Shop', reason: 'Reward' };
  expect(buildTransactionPatch(original, form)).toEqual({ amount: 180, kind: 'Cashback', clearAccount: true, clearCounterpartyAccount: true, paymentChannel: 'UPI', categoryId: 'income', senderName: 'Shop', reason: 'Reward', transactionDate: '2026-11-10', visibility: 'Private' });
});
test.each(['', '0', '-1', 'NaN', 'Infinity', '12oops', '1.001'])('invalid amount %s cannot be saved', amount => {
  expect(validateTransactionEdit({ ...toTransactionEditForm(transaction), amount })).toBe('Enter a valid amount before saving the transaction.');
});
test('valid decimals and calendar dates are required', () => {
  expect(validateTransactionEdit({ ...toTransactionEditForm(transaction), amount: '0.01' })).toBeNull();
  expect(validateTransactionEdit({ ...toTransactionEditForm(transaction), transactionDate: '2026-02-30' })).toBe('Enter a valid transaction date.');
});
const category = (id: string, name: string, parentCategoryId: string | null = null, extra: Partial<Category> = {}): Category => ({ id, name, parentCategoryId, householdId: null, type: 'Expense', classification: 'Essential', isHidden: false, isSystemCategory: true, icon: null, sortOrder: 0, createdAt: '', ...extra });
test('category tree sorts siblings, retains headings during search, and never selects groups with hidden children', () => {
  const categories = [category('b', 'Zebra'), category('g', 'Food'), category('s', 'Snacks', 'g'), category('h', 'Hidden', null, { isHidden: true }), category('hc', 'Child', 'h'), category('e', 'Empty group'), category('ec', 'Hidden child', 'e', { isHidden: true }), category('i', 'Income', null, { type: 'Income' })];
  expect(categoryRows(categories, false).map(r => [r.value, r.selectable, r.depth])).toEqual([['e', false, 0], ['g', false, 0], ['s', true, 1], ['b', true, 0]]);
  expect(categoryRows(categories, false, 'snack').map(r => r.value)).toEqual(['g', 's']);
  expect(categoryRows(categories, true).map(r => r.value)).toEqual(['i']);
});
async function setup(data: unknown) {
  const requests: HttpRequest[] = [];
  const client = new FinanceClient(async request => {
    requests.push(request);
    return { status: 200, data: request.path === '/api/auth/login' ? { accessToken: 'token', accessTokenExpiresAt: '2099-01-01', requiresPrivacyConsent: false, user: { id: 'u', displayName: 'Person' } } : data };
  }, async () => {});
  await client.login('person@example.test', 'password');
  return { client, requests };
}
test.each(['delete', 'restore'] as const)('%s uses web method, path, authorization and no body', async action => {
  const data = { ...transaction, id: 'record/1' };
  const { client, requests } = await setup(data);
  expect(await (action === 'delete' ? client.deleteTransaction(data.id) : client.restoreTransaction(data.id))).toEqual(data);
  expect(requests[1]).toEqual({ path: `/api/transactions/record%2F1${action === 'restore' ? '/restore' : ''}`, method: action === 'delete' ? 'DELETE' : 'POST', body: undefined, headers: { Authorization: 'Bearer token' } });
});
test.each([undefined, 'home & family'])('trash list encodes optional household %s', async householdId => {
  const data = { items: [{ ...transaction, householdId: householdId ?? 'home' }] };
  const { client, requests } = await setup(data);
  expect(await client.listDeletedTransactions(householdId)).toEqual(data);
  expect(requests[1]).toMatchObject({ path: `/api/transactions/trash${householdId ? '?householdId=home%20%26%20family' : ''}`, method: 'GET', body: undefined });
});
test.each(['delete', 'restore'] as const)('%s rejects unverifiable mutation responses with unknown outcome', async action => {
  const { client } = await setup({ ...transaction, id: 'wrong' });
  await expect(action === 'delete' ? client.deleteTransaction('record') : client.restoreTransaction('record')).rejects.toMatchObject({ outcome: 'unknown' });
});
test.each([null, { items: [{}] }, { items: [transaction] }])('trash rejects malformed or cross-household data', async data => {
  const { client } = await setup(data);
  await expect(client.listDeletedTransactions('other')).rejects.toThrow('could not be verified');
});
test('update sends the complete editor patch without changing the wire names', async () => {
  const { client, requests } = await setup(transaction);
  const patch = buildTransactionPatch(transaction, { ...toTransactionEditForm(transaction), accountId: 'bank', kind: 'Transfer', counterpartyAccountId: 'cash' });
  await client.updateTransaction(transaction.id, patch);
  expect(requests[1]).toMatchObject({ path: '/api/transactions/record', method: 'PATCH', body: patch });
});
