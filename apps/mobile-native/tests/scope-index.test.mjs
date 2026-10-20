import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecureJsonStore } from '../src/services/secure-json.ts';
import { ScopeIndex } from '../src/services/scope-index.ts';

const fixture = () => { const values = new Map(); return new SecureJsonStore({ get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } }, 'index'); };
test('concurrent household registration survives restart without losing a cleanup scope', async () => {
  const vault = fixture(); const index = new ScopeIndex(vault, 'alice');
  await Promise.all([index.register('personal'), index.register('family'), index.register('personal')]);
  assert.deepEqual(await new ScopeIndex(vault, 'alice').list(), ['personal', 'family']);
  await index.clear(); assert.deepEqual(await index.list(), []);
});
test('a corrupt or foreign scope inventory cannot be used to erase another owner data', async () => {
  const vault = fixture(); await vault.put({ version: 1, ownerId: 'bob', households: ['family'] });
  await assert.rejects(new ScopeIndex(vault, 'alice').list());
  await vault.put({ version: 1, ownerId: 'alice', households: [null] }); await assert.rejects(new ScopeIndex(vault, 'alice').register('personal'));
});
