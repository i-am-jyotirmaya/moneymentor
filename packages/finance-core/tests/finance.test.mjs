import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTransactionIntent, categoryOptions, dateInTimeZone, decodeComposerDraft, emptyDraft, isValidDate, parseMoney, ValidationError } from '../src/index.ts';

const category = (id, name, parentCategoryId = null, extra = {}) => ({ id, name, parentCategoryId, type: 'Expense', isHidden: false, sortOrder: 0, ...extra });
const settings = { currencyCode: 'INR', timeZone: 'Asia/Kolkata', defaultTransactionVisibility: 'Private' };
const resources = { settings, today: '2026-10-19', householdId: 'home', canWrite: true,
  accounts: [
    { id: 'bank', name: 'Kotak', accountType: 'BankAccount', isActive: true, householdId: 'home', currencyCode: 'INR' },
    { id: 'card', name: 'Kotak upi', accountType: 'CreditCard', isActive: true, householdId: 'home', currencyCode: 'INR' },
  ], categories: [category('food', 'Food'), category('groceries', 'Groceries', 'food')] };
const draft = () => ({ ...emptyDraft(settings, resources.today), amount: '40.29', accountId: 'card', categoryId: 'groceries' });

test('money parsing uses integer minor units and rejects unsafe or imprecise inputs', () => {
  assert.equal(parseMoney('0.29'), 29);
  assert.equal(parseMoney('40.2'), 4020);
  assert.equal(parseMoney('999999999999'), 99999999999900);
  for (const input of ['0', '-5', '1e4', '1.001', 'NaN', 'Infinity', '1000000000000', '999999999999.01', '1,000', '₹40', '.5', '40.']) assert.equal(parseMoney(input), null, input);
});
test('calendar validation handles leap days, overflow and future dates', () => {
  assert.equal(isValidDate('2024-02-29', resources.today), true);
  for (const d of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-10-20', '26-10-19']) assert.equal(isValidDate(d, resources.today), false);
  assert.equal(dateInTimeZone('Asia/Kolkata', new Date('2026-10-18T20:00:00Z')), '2026-10-19');
});
test('picker retains full hierarchy and excludes hidden parents, orphans, cycles and wrong types', () => {
  const input = [...resources.categories, category('hidden', 'Hidden', null, { isHidden: true }), category('child', 'Secret', 'hidden'),
    category('orphan', 'Orphan', 'missing'), category('a', 'A', 'b'), category('b', 'B', 'a'), category('salary', 'Salary', null, { type: 'Income' })];
  assert.deepEqual(categoryOptions(input, 'Expense').map(c => c.label), ['Food', 'Food / Groceries']);
  assert.deepEqual(categoryOptions(input, 'Expense', 'food / gro').map(c => c.id), ['groceries']);
});
test('manual intent sends exact selected credit-card and category IDs without name heuristics', () => {
  const intent = buildTransactionIntent(draft(), resources, 'native:reference-123');
  assert.equal(intent.accountId, 'card');
  assert.equal(intent.categoryId, 'groceries');
  assert.equal(intent.eventKind, 'Purchase');
  assert.equal(JSON.stringify(intent).includes('40.29'), true);
  assert.equal(Object.isFrozen(intent), true);
});
test('validation rejects inactive, foreign currency, foreign household and unavailable categories', () => {
  for (const account of [{ isActive: false }, { currencyCode: 'USD' }, { householdId: 'other' }]) {
    assert.throws(() => buildTransactionIntent(draft(), { ...resources, accounts: [{ ...resources.accounts[1], ...account }] }, 'native:reference-123'), ValidationError);
  }
  assert.throws(() => buildTransactionIntent({ ...draft(), eventKind: 'Income' }, resources, 'native:reference-123'), ValidationError);
  assert.throws(() => buildTransactionIntent(draft(), { ...resources, canWrite: false }, 'native:reference-123'), ValidationError);
});
test('restored drafts are user scoped and interrupted manual operations retain the frozen replay', () => {
  const payload = buildTransactionIntent(draft(), resources, 'native:reference-123');
  const saved = { version: 1, ownerId: 'alice', manual: draft(), text: 'coffee 40', assistantUncertain: true, pendingManual: { payload, phase: 'sending' } };
  assert.equal(decodeComposerDraft(saved, 'bob'), null);
  const restored = decodeComposerDraft(JSON.parse(JSON.stringify(saved)), 'alice');
  assert.equal(restored.pendingManual.phase, 'uncertain');
  assert.equal(restored.pendingManual.payload.externalReference, payload.externalReference);
  assert.equal(restored.assistantUncertain, true);
  assert.equal(decodeComposerDraft({ ...saved, pendingManual: { payload: {}, phase: 'sending' } }, 'alice'), null);
});
