import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, FinanceClient } from '../src/index.ts';

const session = { accessToken: 'test', accessTokenExpiresAt: '2099-01-01T00:00:00Z', requiresPrivacyConsent: false, user: { id: 'alice', displayName: 'Alice' } };
async function clientFor(data) {
  const calls = []; const client = new FinanceClient(async request => { calls.push(request); return { status: 200, data: request.path.endsWith('/login') ? session : data }; }, async () => {});
  await client.login('fixture@example.test', 'fixture-only'); return { client, calls };
}
test('malformed category/account reads are rejected before they can become native picker resources', async () => {
  for (const data of [null, {}, { householdId: 'home', canWrite: true, categories: null }, { householdId: 'home', canWrite: true, categories: [{ id: 'category', name: 42 }] }]) {
    const { client } = await clientFor(data); await assert.rejects(client.categories(), ApiError);
  }
  const { client } = await clientFor([{ id: 'card', householdId: 'other', name: 'Card', accountType: 'CreditCard', currencyCode: 'INR', isActive: true }]);
  await assert.rejects(client.accounts('home'), error => error.outcome === 'rejected');
});
test('invalid currency/time-zone settings fail as a recoverable read instead of crashing date formatting', async () => {
  const settings = { userProfileId: 'alice', displayName: 'Alice', email: 'fixture@example.test', currencyCode: 'INR', timeZone: 'Asia/Kolkata', plan: 'Free', requireMerchantForExpenses: false, defaultTransactionVisibility: 'Private' };
  for (const change of [{ timeZone: 'Invalid/Zone' }, { currencyCode: null }, { defaultTransactionVisibility: 'Everyone' }]) {
    const { client } = await clientFor({ ...settings, ...change }); await assert.rejects(client.settings(), ApiError);
  }
  const { client } = await clientFor(settings); assert.deepEqual(await client.settings(), settings);
});
test('history requires a matching page/month and validated records without silently falling back to another scope', async () => {
  const transaction = { id: 'tx', amount: 12.34, currencyCode: 'INR', type: 'Expense', transactionDate: '2026-10-20', householdId: 'home' };
  const page = { month: '2026-10', page: 1, pageSize: 30, totalCount: 1, totalPages: 1, items: [transaction] };
  for (const change of [{ month: '2026-09' }, { page: 2 }, { items: null }, { items: [{ ...transaction, amount: Number.NaN }] }, { items: [{ ...transaction, householdId: 'other' }] }]) {
    const { client } = await clientFor({ ...page, ...change }); await assert.rejects(client.transactions('2026-10', 1, 'home'), ApiError);
  }
  const { client } = await clientFor(page); assert.deepEqual(await client.transactions('2026-10', 1, 'home'), page);
});
test('invalid history query parameters are rejected before making a network request', async () => {
  const { client, calls } = await clientFor({});
  for (const [month, page] of [['2026-13', 1], ['2026-10', 0], ['2026-10', 1.5]]) await assert.rejects(client.transactions(month, page), ApiError);
  assert.equal(calls.length, 1, 'Only the explicit login request');
});
test('public policy reads reject missing versions and non-HTTPS policy links before consent', async () => {
  const policy = { version: 'current', effectiveDate: '2026-10-20', policyUrl: 'https://example.test/privacy', supportEmail: 'support@example.test' };
  for (const data of [null, { ...policy, version: '' }, { ...policy, policyUrl: 'http://example.test/privacy' }, { ...policy, policyUrl: 'javascript:alert(1)' }]) {
    const { client } = await clientFor(data); await assert.rejects(client.privacyPolicy(), ApiError);
  }
  const { client } = await clientFor(policy); assert.deepEqual(await client.privacyPolicy(), policy);
});
test('an unknown registration mode cannot silently enable open signup', async () => {
  const { client } = await clientFor({ mode: 'Unexpected' }); await assert.rejects(client.registration(), ApiError);
});
