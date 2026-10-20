import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendAssistantHistory, decodeAssistantHistory } from '../src/services/assistant-history.ts';

test('on-device assistant previews are owner/household scoped and reject a foreign restore', () => {
  const exchanges = appendAssistantHistory([], { id: 'one', text: 'coffee', reply: 'How much?', date: '2026-10-20T06:00:00Z', transactionId: null });
  const value = { version: 1, ownerId: 'alice', householdId: 'personal', exchanges };
  assert.deepEqual(decodeAssistantHistory(value, 'alice', 'personal'), exchanges);
  assert.equal(decodeAssistantHistory(value, 'bob', 'personal'), null); assert.equal(decodeAssistantHistory(value, 'alice', 'family'), null);
});
test('encrypted previews remain bounded with multilingual text, emoji and JSON escape expansion', () => {
  let items = [];
  for (let index = 0; index < 30; index++) items = appendAssistantHistory(items, { id: String(index), text: '₹☕ '.repeat(1000), reply: '\u0000'.repeat(4000), date: '2026-10-20T06:00:00Z', transactionId: null });
  assert.ok(items.length <= 12); assert.ok(JSON.stringify(items).length <= 12000); assert.equal(items.at(-1).id, '29'); assert.equal(items.at(-1).previewOnly, true);
});
