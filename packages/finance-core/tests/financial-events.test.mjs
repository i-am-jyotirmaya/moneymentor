import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialEventIntent, ValidationError } from '../src/index.ts';

const account = (id, accountType) => ({ id, name: id, accountType, householdId: 'home', currencyCode: 'INR', isActive: true });
const resources = { today: '2026-10-19', householdId: 'home', canWrite: true, settings: { currencyCode: 'INR' },
  accounts: [account('bank', 'BankAccount'), account('card', 'CreditCard'), account('cash', 'Cash')],
  categories: [{ id: 'food', name: 'Food', type: 'Expense', parentCategoryId: null, isHidden: false }] };
const draft = { eventKind: 'CreditCardPayment', amount: '45.50', date: '2026-10-19', accountId: 'bank', counterpartyAccountId: 'card',
  categoryId: null, merchant: '', description: '', paymentChannel: 'BankTransfer', visibility: 'Private', unlinkedRefund: false };

test('card settlement retains its own financial kind and exact source/destination without an expense category', () => {
  const intent = buildFinancialEventIntent(draft, resources, 'native:card-payment-123');
  assert.equal(intent.eventKind, 'CreditCardPayment');
  assert.equal(intent.accountId, 'bank');
  assert.equal(intent.counterpartyAccountId, 'card');
  assert.equal(intent.categoryId, undefined);
  assert.ok(Object.isFrozen(intent));
});

test('settlement and withdrawal reject invalid account direction or the same account', () => {
  for (const change of [{ accountId: 'card', counterpartyAccountId: 'bank' }, { counterpartyAccountId: 'bank' },
    { eventKind: 'CashWithdrawal', counterpartyAccountId: 'card' }]) {
    assert.throws(() => buildFinancialEventIntent({ ...draft, ...change }, resources, 'native:invalid-pair-123'), ValidationError);
  }
});

test('a linked refund keeps the original visibility and cannot precede or exceed the original', () => {
  const refund = { ...draft, eventKind: 'Refund', amount: '10.25', accountId: 'card', counterpartyAccountId: null, visibility: 'Household' };
  const original = { id: 'purchase', amount: 45.50, kind: 'Purchase', type: 'Expense', householdId: 'home', currencyCode: 'INR',
    accountId: 'card', transactionDate: '2026-10-18', visibility: 'Private' };
  const intent = buildFinancialEventIntent(refund, resources, 'native:refund-123', original);
  assert.equal(intent.relatedTransactionId, 'purchase');
  assert.equal(intent.visibility, 'Private');
  assert.equal(intent.matchOriginal, false);
  for (const change of [{ date: '2026-10-17' }, { amount: '50' }, { accountId: 'bank' }]) {
    assert.throws(() => buildFinancialEventIntent({ ...refund, ...change }, resources, 'native:refund-123', original), ValidationError);
  }
});

test('an unlinked refund requires explicit intent and reversals always require an original', () => {
  const refund = { ...draft, eventKind: 'Refund', accountId: 'card', categoryId: 'food', counterpartyAccountId: null };
  assert.throws(() => buildFinancialEventIntent(refund, resources, 'native:refund-123'), ValidationError);
  assert.equal(buildFinancialEventIntent({ ...refund, unlinkedRefund: true }, resources, 'native:refund-123').eventKind, 'Refund');
  assert.throws(() => buildFinancialEventIntent({ ...refund, eventKind: 'Reversal', unlinkedRefund: true }, resources, 'native:reversal-123'), ValidationError);
});
