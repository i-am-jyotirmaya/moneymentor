import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { SecureJsonStore } from '../src/services/secure-json.ts';
import { fixtureTransport } from '../src/services/fixture-transport.ts';
import { authCookieSnapshot } from '../src/services/auth-cookie-policy.ts';
import { FinanceClient } from '../../../packages/finance-core/src/index.ts';

function memoryBackend() {
  const values = new Map(); let fail = null;
  return { values, failOn: key => { fail = key; }, backend: {
    get: async key => values.get(key) ?? null,
    set: async (key, value) => { if (key === fail) throw Error('Disk unavailable'); values.set(key, value); },
    remove: async key => { values.delete(key); },
  } };
}
test('secure JSON chunking preserves long multilingual drafts and emoji', async () => {
  const memory = memoryBackend(); const vault = new SecureJsonStore(memory.backend, 'alice');
  const draft = { message: '₹ ಕನ್ನಡ ଓଡ଼ିଆ 😀'.repeat(400) };
  await vault.put(draft);
  assert.deepEqual(await vault.get(), draft);
  for (const [key, value] of memory.values) if (key !== 'alice') assert.ok(Buffer.byteLength(value, 'utf8') <= 1600);
});
test('a failed multi-record write leaves the last committed draft readable', async () => {
  const memory = memoryBackend(); const vault = new SecureJsonStore(memory.backend, 'draft');
  await vault.put({ text: 'first' });
  memory.failOn('draft.b.1');
  await assert.rejects(vault.put({ text: 'second'.repeat(200) }));
  assert.deepEqual(await vault.get(), { text: 'first' });
});
test('closing a user vault prevents late autosaves and removes both storage banks', async () => {
  const memory = memoryBackend(); const vault = new SecureJsonStore(memory.backend, 'alice');
  await vault.put({ text: 'financial data' });
  await vault.closeAndRemove();
  await assert.rejects(vault.put({ text: 'late callback' }));
  assert.equal(memory.values.size, 0);
});
test('corrupt/incomplete secure metadata is rejected instead of silently losing a pending write', async () => {
  const memory = memoryBackend(); const vault = new SecureJsonStore(memory.backend, 'draft');
  memory.values.set('draft', JSON.stringify({ slot: 'a', count: 2 }));
  memory.values.set('draft.a.0', '{');
  await assert.rejects(vault.get(), /incomplete/);
});
test('Android cookie snapshots restore a secure auth-only policy without relying on missing attributes', () => {
  const snapshot = authCookieSnapshot({ mm_refresh: { value: 'opaque-refresh-value', secure: false, httpOnly: false }, unrelated: { value: 'not-auth' } }, 'api.example.test');
  assert.deepEqual(snapshot, [{ name: 'mm_refresh', value: 'opaque-refresh-value', domain: 'api.example.test', path: '/api/auth', secure: true, httpOnly: true }]);
});
test('cookie snapshots retain native expiry on either platform without broadening the auth path', () => {
  const snapshot = authCookieSnapshot({ mm_refresh: { value: 'opaque', expires: '2026-11-01T00:00:00Z' } }, 'api.example.test');
  assert.equal(snapshot[0].expires, '2026-11-01T00:00:00Z');
  assert.equal(snapshot[0].path, '/api/auth');
});
test('QA backend exercises a lost response AFTER commit and deduplicates manual replay', async () => {
  const fixture = fixtureTransport(); const client = new FinanceClient(fixture.transport, fixture.clear);
  await client.login('qa@example.test', 'fixture-only');
  const [accounts, catalog] = await Promise.all([client.accounts(), client.categories()]);
  const intent = { eventKind: 'Purchase', amount: 40.29, date: '2026-10-19', accountId: accounts[1].id,
    categoryId: 'groceries', householdId: catalog.householdId, description: 'simulate lost response', merchant: null,
    externalReference: 'native:lost-response-123', sourceText: '', paymentChannel: 'UPI', visibility: 'Private', inputMode: 'Text', confidence: 1 };
  await assert.rejects(client.createTransaction(intent), error => error.outcome === 'unknown');
  const receipt = await client.createTransaction(intent);
  assert.equal(receipt.accountName, 'Kotak upi');
  assert.equal((await client.transactions('2026-10')).items.length, 1);
});
test('QA assistant asks for clarification then creates exactly one record', async () => {
  const fixture = fixtureTransport(); const client = new FinanceClient(fixture.transport, fixture.clear);
  await client.login('qa@example.test', 'fixture-only');
  assert.equal((await client.sendAssistant('coffee', 'INR', '2026-10-19')).status, 'NeedsClarification');
  const result = await client.sendAssistant('30', 'INR', '2026-10-19');
  assert.equal(result.transaction.amount, 30);
  assert.equal((await client.transactions('2026-10')).totalCount, 1);
});
