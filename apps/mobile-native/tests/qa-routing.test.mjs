import assert from 'node:assert/strict';
import test from 'node:test';
import { qaApiRoute } from '../src/services/qa-api-routing.ts';

test('the QA loopback route restores across a process restart and can return to fixtures', () => {
  assert.equal(qaApiRoute(new URL('spndrr-native://qa?api=https%3A%2F%2Flocalhost%3A7443'), null), 'https://localhost:7443');
  assert.equal(qaApiRoute(null, { origin: 'https://localhost:7443' }), 'https://localhost:7443');
  assert.equal(qaApiRoute(new URL('spndrr-native://qa?fixture=1'), { origin: 'https://localhost:7443' }), null);
  assert.equal(qaApiRoute(new URL('spndrr-native://signup?token=not-logged'), null), null);
});
test('QA routing rejects insecure, external, malformed and credential-bearing origins', () => {
  for (const origin of ['http://localhost:7443', 'https://api.example.test', 'https://localhost:7443.evil.test', 'https://user:pass@localhost:7443', 'https://localhost:7443/path', 1]) {
    assert.throws(() => qaApiRoute(null, { origin }));
    assert.throws(() => qaApiRoute(new URL(`spndrr-native://qa?api=${encodeURIComponent(origin)}`), null));
  }
  assert.throws(() => qaApiRoute(null, 'corrupt'));
});
