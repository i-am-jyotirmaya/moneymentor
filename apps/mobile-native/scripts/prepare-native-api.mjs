import assert from 'node:assert/strict';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.ASPNETCORE_ENVIRONMENT, 'Testing');
const origin = process.env.NATIVE_TEST_API_URL;
assert.equal(origin, 'https://localhost:7443', 'Never seed a user or public database');
const email = 'qa@example.test'; const password = 'Native-fixture-only-123!';
async function request(path, body, token, method = 'POST') {
  const response = await fetch(`${origin}${path}`, { method, signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  assert.ok(response.ok, `Native API setup/verification: ${method} ${path}: ${response.status}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
if (process.env.NATIVE_API_ACTION === 'verify') {
  const session = await request('/api/auth/login', { email, password });
  const settings = await request('/api/settings/me', undefined, session.accessToken, 'GET');
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timeZone, year: 'numeric', month: '2-digit' }).format(new Date());
  const page = await request(`/api/transactions?month=${month}&page=1&pageSize=30`, undefined, session.accessToken, 'GET');
  const saved = page.items.filter(item => item.description === 'Native cookie acceptance');
  assert.equal(saved.length, 1); assert.equal(saved[0].amount, 45.5); assert.equal(saved[0].accountName, 'Kotak upi'); assert.equal(saved[0].kind, 'Purchase');
  console.log('Native simulator API receipt verified: one edited purchase on the exact credit-card account.');
} else {
  const policy = await request('/api/public/privacy', undefined, undefined, 'GET');
  const session = await request('/api/auth/users', { email, password, displayName: 'Native simulator acceptance', privacyPolicyVersion: policy.version, acceptPrivacyPolicy: true });
  for (const [name, accountType] of [['Kotak', 'BankAccount'], ['Kotak upi', 'CreditCard']]) {
    await request('/api/financial-accounts', { householdId: null, name, accountType, institution: null, last4: null, aliases: [], shared: false, isActive: true }, session.accessToken);
  }
  console.log('Isolated native simulator API account prepared.');
}
