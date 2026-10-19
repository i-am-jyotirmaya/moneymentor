import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, FinanceClient, SessionChangedError } from '../src/index.ts';

const session = (token = 'access', id = 'alice') => ({ accessToken: token, accessTokenExpiresAt: '2099-01-01T00:00:00Z',
  user: { id, displayName: id, email: `${id}@example.test`, roles: [] }, requiresPrivacyConsent: false });
const ok = (data, status = 200) => ({ status, data });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const transaction = { id: 'tx', amount: 40, currencyCode: 'INR', transactionDate: '2026-10-19', type: 'Expense', kind: 'Purchase', accountId: 'card', categoryId: 'groceries', householdId: 'home' };

test('concurrent unauthorized reads share one refresh and use the new token', async () => {
  let refreshes = 0;
  const client = new FinanceClient(async req => {
    if (req.path.endsWith('/login')) return ok(session());
    if (req.path.endsWith('/refresh')) { refreshes++; await Promise.resolve(); return ok(session('new')); }
    return req.headers?.Authorization === 'Bearer new' ? ok([]) : ok({}, 401);
  }, async () => {});
  await client.login('alice@example.test', 'password');
  await Promise.all([client.accounts(), client.accounts(), client.accounts()]);
  assert.equal(refreshes, 1);
});
test('a refresh network failure preserves the session and does not clear local cookies', async () => {
  let cleared = 0;
  const client = new FinanceClient(async req => { if (req.path.endsWith('/login')) return ok(session()); throw Error('offline'); }, async () => { cleared++; });
  await client.login('a', 'p');
  await assert.rejects(client.refresh(), ApiError);
  assert.equal(client.getSnapshot().session.user.id, 'alice');
  assert.equal(cleared, 1); // only the explicit login reset
});
test('restore distinguishes an unavailable API from revoked authentication', async () => {
  let revoked = false;
  const client = new FinanceClient(async () => { if (revoked) return ok({}, 401); throw Error('offline'); }, async () => {});
  await assert.rejects(client.restore());
  assert.equal(client.getSnapshot().status, 'unavailable');
  revoked = true;
  await assert.rejects(client.restore());
  assert.equal(client.getSnapshot().status, 'signedOut');
});
test('logout waits for refresh rotation and prevents a late refresh from signing in again', async () => {
  const pending = deferred();
  const calls = [];
  const client = new FinanceClient(async req => {
    calls.push(req.path);
    if (req.path.endsWith('/login')) return ok(session());
    if (req.path.endsWith('/refresh')) return pending.promise;
    return ok(null, 204);
  }, async () => {});
  await client.login('a', 'p');
  const refresh = client.refresh();
  await Promise.resolve();
  const signout = client.logout();
  pending.resolve(ok(session('rotated')));
  await assert.rejects(refresh, SessionChangedError);
  await signout;
  assert.equal(client.getSnapshot().session, null);
  assert.equal(calls.at(-1), '/api/auth/logout');
});
test('a request from a previous user cannot return into the new user session', async () => {
  const pending = deferred(); let id = 'alice';
  const client = new FinanceClient(async req => req.path.endsWith('/login') ? ok(session(id, id)) : pending.promise, async () => {});
  await client.login('a', 'p');
  const read = client.accounts();
  id = 'bob'; await client.login('b', 'p');
  pending.resolve(ok([]));
  await assert.rejects(read, SessionChangedError);
  assert.equal(client.getSnapshot().session.user.id, 'bob');
});
test('write failures are never automatically retried; validation and unknown outcomes differ', async () => {
  let writes = 0; let status = 400;
  const client = new FinanceClient(async req => {
    if (req.path.endsWith('/login')) return ok(session());
    writes++;
    return ok({ errors: { amount: ['Amount must be positive.'] } }, status);
  }, async () => {});
  await client.login('a', 'p');
  await assert.rejects(client.createTransaction({}), error => error.outcome === 'rejected' && error.message === 'Amount must be positive.');
  status = 503;
  await assert.rejects(client.createTransaction({}), error => error.outcome === 'unknown');
  assert.equal(writes, 2);
});
test('manual retry replays the exact reference; malformed success is not reported as saved', async () => {
  const bodies = []; let malformed = true;
  const client = new FinanceClient(async req => {
    if (req.path.endsWith('/login')) return ok(session());
    bodies.push(req.body); return ok(malformed ? {} : transaction);
  }, async () => {});
  await client.login('a', 'p');
  const intent = Object.freeze({ amount: 40, externalReference: 'native:stable-123', accountId: 'card', eventKind: 'Purchase', date: '2026-10-19', categoryId: 'groceries', householdId: 'home' });
  await assert.rejects(client.createTransaction(intent), e => e.outcome === 'unknown');
  malformed = false;
  assert.equal((await client.createTransaction(intent)).id, 'tx');
  assert.equal(bodies[0], bodies[1]);
});
test('assistant preserves clarification and sends the write-on-message contract once', async () => {
  const messages = [];
  const client = new FinanceClient(async req => {
    if (req.path.endsWith('/login')) return ok(session());
    messages.push(req);
    return ok({ status: 'NeedsClarification', intent: 'CreateExpense', assistantMessage: 'How much?', transaction: null, errors: [] });
  }, async () => {});
  await client.login('a', 'p');
  const response = await client.sendAssistant(' coffee ', 'INR', '2026-10-19');
  assert.equal(response.status, 'NeedsClarification');
  assert.equal(messages[0].path, '/api/assistant/messages');
  assert.equal(messages[0].body.text, 'coffee');
  assert.equal(messages.length, 1);
});
test('one unauthorized replay is allowed, but a second unauthorized response is surfaced', async () => {
  let reads = 0;
  const client = new FinanceClient(async req => {
    if (req.path.endsWith('/login') || req.path.endsWith('/refresh')) return ok(session());
    reads++; return ok({}, 401);
  }, async () => {});
  await client.login('a', 'p');
  await assert.rejects(client.accounts(), error => error.status === 401);
  assert.equal(reads, 2);
});
test('a completed write from a previous session retains an unknown outcome rather than inviting a new submission', async () => {
  const pending = deferred();
  const client = new FinanceClient(async req => {
    if (req.path.endsWith('/login')) return ok(session());
    if (req.path.endsWith('/logout')) return ok(null, 204);
    return pending.promise;
  }, async () => {});
  await client.login('a', 'p');
  const write = client.createTransaction({});
  await client.logout();
  pending.resolve(ok(transaction));
  await assert.rejects(write, error => error instanceof ApiError && error.outcome === 'unknown');
});
test('a mismatched successful receipt cannot be displayed as the requested saved transaction', async () => {
  const client = new FinanceClient(async req => req.path.endsWith('/login') ? ok(session()) : ok({ ...transaction, accountId: 'bank' }), async () => {});
  await client.login('a', 'p');
  await assert.rejects(client.createTransaction({ amount: 40, accountId: 'card', eventKind: 'Purchase', date: '2026-10-19', categoryId: 'groceries', householdId: 'home' }), error => error.outcome === 'unknown');
});
