import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../../packages/finance-core/src/index.ts';
import { SecureJsonStore } from '../src/services/secure-json.ts';
import { WriteGuard } from '../src/services/write-guard.ts';

const fixture = () => {
  const records = new Map(); let fail = false;
  const vault = new SecureJsonStore({ get: async key => records.get(key) ?? null,
    set: async (key, value) => { if (fail) throw Error('Storage unavailable'); records.set(key, value); },
    remove: async key => { if (fail) throw Error('Storage unavailable'); records.delete(key); } }, 'operations');
  return { vault, fail: () => { fail = true; } };
};

test('an uncertain non-idempotent write blocks another submission after a process restart', async () => {
  const { vault } = fixture();
  const first = new WriteGuard(vault, 'alice'); await first.restore();
  await assert.rejects(first.run('Add goal contribution', async () => { throw new ApiError('Response lost', 0, 'unknown'); }));
  const reopened = new WriteGuard(vault, 'alice'); await reopened.restore();
  let sends = 0;
  await assert.rejects(reopened.run('Add contribution again', async () => { sends++; }));
  assert.equal(sends, 0);
  assert.equal(reopened.getSnapshot().pending.label, 'Add goal contribution');
});

test('secure storage failure prevents a financial network write', async () => {
  const local = fixture(); const guard = new WriteGuard(local.vault, 'alice'); await guard.restore(); local.fail();
  let sends = 0;
  await assert.rejects(guard.run('Create goal', async () => { sends++; }));
  assert.equal(sends, 0);
});

test('a definite validation rejection releases the operation without replaying it', async () => {
  const { vault } = fixture(); const guard = new WriteGuard(vault, 'alice'); await guard.restore();
  let sends = 0;
  await assert.rejects(guard.run('Create goal', async () => { sends++; throw new ApiError('Invalid amount', 400, 'rejected'); }));
  assert.equal(sends, 1);
  assert.equal(guard.getSnapshot().pending, null);
  assert.equal(await guard.run('Corrected goal', async () => 'saved'), 'saved');
});

test('cleanup failure preserves a successful receipt while blocking a duplicate', async () => {
  const local = fixture(); const guard = new WriteGuard(local.vault, 'alice'); await guard.restore();
  assert.equal(await guard.run('Contribute', async () => { local.fail(); return 'confirmed'; }), 'confirmed');
  assert.ok(guard.getSnapshot().pending);
  await assert.rejects(guard.run('Contribute', async () => 'duplicate'));
});

test('a corrupt or foreign operation record fails closed', async () => {
  const { vault } = fixture(); await vault.put({ version: 1, ownerId: 'bob', label: 'private change', startedAt: 'now' });
  const guard = new WriteGuard(vault, 'alice'); await guard.restore();
  assert.equal(guard.getSnapshot().ready, false);
  await assert.rejects(guard.run('Write', async () => 'unsafe'));
});
