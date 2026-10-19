import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { FinanceClient, dateInTimeZone } from '../../../packages/finance-core/src/index.ts';

// Only an isolated CI backend is permitted. Never seed a public/user database.
const origin = process.env.NATIVE_TEST_API_URL;
assert.equal(origin, 'https://localhost:7443');
const jar = new Map();
const cookieAttributes = new Map();
let writes = 0;
const transport = async request => {
  const auth = request.path.startsWith('/api/auth/');
  const headers = { Accept: 'application/json', ...request.headers };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && jar.size) headers.Cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  if (request.method === 'POST' && request.path === '/api/transactions') writes++;
  const response = await fetch(`${origin}${request.path}`, {
    method: request.method, headers, signal: AbortSignal.timeout(20000),
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair, ...attributes] = cookie.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value) jar.set(name, value); else jar.delete(name);
    cookieAttributes.set(name, attributes.map(attribute => attribute.trim().toLowerCase()));
  }
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};

const email = `native-${randomUUID()}@example.test`;
const password = `Native-test-${randomUUID()}!`;
const policy = await transport({ path: '/api/public/privacy', method: 'GET' });
assert.equal(policy.status, 200);
const created = await transport({ path: '/api/auth/users', method: 'POST', body: {
  email, password, displayName: 'Native acceptance',
  privacyPolicyVersion: policy.data.version, acceptPrivacyPolicy: true,
} });
assert.equal(created.status, 200, 'CI account registration');
const client = new FinanceClient(transport, async () => { jar.clear(); });
await client.login(email, password);
for (const name of ['mm_refresh', 'mm_session']) {
  assert.ok(jar.has(name));
  const attributes = cookieAttributes.get(name);
  assert.ok(attributes.includes('httponly'));
  assert.ok(attributes.includes('secure'));
  assert.ok(attributes.includes('path=/api/auth'));
}

const [catalog, settings] = await Promise.all([client.categories(), client.settings()]);
assert.equal(catalog.canWrite, true);
const bank = await client.createAccount('Kotak', 'BankAccount');
const card = await client.createAccount('Kotak upi', 'CreditCard');
assert.notEqual(bank.id, card.id);
const category = catalog.categories.find(candidate => candidate.type === 'Expense' && !candidate.isHidden && candidate.parentCategoryId)
  ?? catalog.categories.find(candidate => candidate.type === 'Expense' && !candidate.isHidden);
assert.ok(category, 'Existing expense category');
const today = dateInTimeZone(settings.timeZone);
const intent = Object.freeze({ eventKind: 'Purchase', amount: 40.29, date: today,
  accountId: card.id, categoryId: category.id, householdId: catalog.householdId,
  merchant: null, description: 'Native acceptance purchase', sourceText: '', paymentChannel: 'UPI',
  visibility: 'Private', inputMode: 'Text', externalReference: `native:${randomUUID()}`, confidence: 1 });
const saved = await client.createTransaction(intent);
const replay = await client.createTransaction(intent);
assert.equal(saved.id, replay.id, 'Exact reference replay must deduplicate');
assert.equal(saved.accountId, card.id);
assert.equal(saved.kind, 'Purchase');
const page = await client.transactions(today.slice(0, 7));
assert.equal(page.items.filter(transaction => transaction.id === saved.id).length, 1);
const edited = await client.updateTransaction(saved.id, { amount: 45.50, accountId: card.id });
assert.equal(edited.amount, 45.50);
assert.equal(edited.kind, 'Purchase');

const previousRefresh = jar.get('mm_refresh');
const renewed = await client.refresh();
assert.equal(renewed.user.email, email);
assert.notEqual(jar.get('mm_refresh'), previousRefresh, 'Refresh cookie rotation');
// A new client has no access token, but can restore using the persisted cookie.
const reopened = new FinanceClient(transport, async () => { jar.clear(); });
await reopened.restore();
assert.equal(reopened.getSnapshot().session.user.id, renewed.user.id);
assert.ok((await reopened.transactions(today.slice(0, 7))).items.some(transaction => transaction.id === saved.id && transaction.amount === 45.50));
await reopened.logout();
assert.equal(jar.size, 0);
assert.equal((await transport({ path: '/api/auth/refresh', method: 'POST' })).status, 401);
assert.equal(writes, 2, 'No automatic financial retries');
console.log('Real HTTPS API acceptance passed: secure cookies, exact card identity, write/replay, edit, refresh rotation, restart restoration and logout.');
