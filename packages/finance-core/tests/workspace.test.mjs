import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FinanceClient, workspaceApi } from '../src/index.ts';

const session = token => ({ accessToken: token, accessTokenExpiresAt: '2099-01-01T00:00:00Z',
  user: { id: 'alice', email: 'alice@example.test', displayName: 'Alice', roles: [] }, requiresPrivacyConsent: false });

test('planning keeps the same idempotency reference and body across an explicit unauthorized replay', async () => {
  const attempts = [];
  const client = new FinanceClient(async request => {
    if (request.path.endsWith('/login')) return { status: 200, data: session('old') };
    if (request.path.endsWith('/refresh')) return { status: 200, data: session('new') };
    attempts.push(request);
    return request.headers.Authorization === 'Bearer old' ? { status: 401, data: {} }
      : { status: 202, data: { id: 'run', goalId: 'goal', status: 'Pending' } };
  }, async () => {});
  await client.login('alice@example.test', 'password');
  const input = Object.freeze({ pace: 'Balanced', monthlyContribution: 500 });
  await workspaceApi(client).startPlan('goal', input, 'stable-operation-123');
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every(attempt => attempt.body === input && attempt.headers['Idempotency-Key'] === 'stable-operation-123'));
});

test('a lost goal contribution response is unknown and is never automatically resent', async () => {
  let contributions = 0;
  const client = new FinanceClient(async request => {
    if (request.path.endsWith('/login')) return { status: 200, data: session('access') };
    contributions++;
    throw Error('Response lost after commit');
  }, async () => {});
  await client.login('alice@example.test', 'password');
  await assert.rejects(workspaceApi(client).contribute('goal', { amount: 25.50 }), error => error.outcome === 'unknown');
  assert.equal(contributions, 1);
});

test('a contribution acknowledgement with another amount or goal cannot confirm a financial write', async () => {
  const client = new FinanceClient(async request => request.path.endsWith('/login')
    ? { status: 200, data: session('access') }
    : { status: 201, data: { id: 'contribution', goalId: 'different-goal', amount: 999 } }, async () => {});
  await client.login('alice@example.test', 'password');
  await assert.rejects(workspaceApi(client).contribute('goal', { amount: 25.50 }), error => error.outcome === 'unknown');
});

test('a denied household read stays denied instead of silently falling back to personal data', async () => {
  let reads = 0;
  const client = new FinanceClient(async request => {
    if (request.path.endsWith('/login')) return { status: 200, data: session('access') };
    reads++;
    assert.match(request.path, /householdId=family/);
    return { status: 403, data: { title: 'Forbidden' } };
  }, async () => {});
  await client.login('alice@example.test', 'password');
  await assert.rejects(workspaceApi(client).dashboard('2026-10', 'family'), error => error.status === 403);
  assert.equal(reads, 1);
});

test('signup uses the serialized session boundary and clears the previous user credentials', async () => {
  let cleared = 0;
  const client = new FinanceClient(async request => {
    assert.equal(request.path, '/api/auth/users');
    assert.equal(request.body.email, 'alice@example.test');
    assert.equal(request.body.acceptPrivacyPolicy, true);
    return { status: 200, data: session('new-user') };
  }, async () => { cleared++; });
  await client.signup({ email: ' alice@example.test ', password: 'fixture-only', displayName: 'Alice', privacyPolicyVersion: 'current', acceptPrivacyPolicy: true });
  assert.equal(cleared, 1);
  assert.equal(client.getSnapshot().session.accessToken, 'new-user');
});
