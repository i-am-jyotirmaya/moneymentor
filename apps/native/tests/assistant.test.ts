import { ApiError, FinanceClient, type HttpRequest } from '../src/api/client';
import type { AssistantResponse, Transaction } from '../src/api/models';
import { assistantError, buildAssistantRequest, initialAssistantMessages, looksLikeFinanceQuestion, responseMessage, userMessage } from '../src/workspace/assistant-data';

const transaction: Transaction = { id: 't', householdId: 'home', userProfileId: null, amount: 180, currencyCode: 'INR', type: 'Expense', categoryId: 'snacks', categoryName: 'Snacks', merchantName: 'Zepto', description: null, sourceText: 'ice cream', transactionDate: '2026-11-10', inputMode: 'Text', confidence: 1, visibility: 'Private', createdAt: '', updatedAt: '' };
const result: AssistantResponse = { status: 'Responded', intent: 'CreateExpense', assistantMessage: null, transaction: null, errors: [] };
test('initial bubble and normalized user message match web', () => {
  expect(initialAssistantMessages()).toEqual([{ role: 'assistant', text: 'Tell me what you spent or received, or ask where your money went this month.' }]);
  expect(userMessage('  petrol 250  ')).toEqual({ role: 'user', text: 'petrol 250' });
});
test('ordinary chat omits date and uses selected household and settings currency', () => {
  expect(buildAssistantRequest(' salary 50000 ', 'USD', 'home')).toEqual({ text: 'salary 50000', inputMode: 'Text', householdId: 'home', currencyCode: 'USD', locale: 'en-IN' });
  expect(buildAssistantRequest('food 50', 'INR', null, '2026-11-10').transactionDate).toBe('2026-11-10');
  expect(buildAssistantRequest('food 50', 'INR', null).householdId).toBeUndefined();
});
test.each(['Responded', 'NeedsClarification', 'Unsupported', 'Failed'] as const)('%s preserves server reply including confirmations', status => {
  expect(responseMessage({ ...result, status, assistantMessage: 'Tracked ₹180 under Snacks from Zepto.', transaction })).toEqual({ role: 'assistant', text: 'Tracked ₹180 under Snacks from Zepto.' });
  expect(responseMessage({ ...result, status, assistantMessage: '' }).text).toBe('');
});
test('fallback order matches web for clarification, transaction and unhandled responses', () => {
  expect(responseMessage({ ...result, status: 'NeedsClarification', transaction }).text).toBe('I need a little more detail before saving this.');
  expect(responseMessage({ ...result, transaction }).text).toBe('Tracked that expense.');
  for (const status of ['Responded', 'Unsupported', 'Failed'] as const) expect(responseMessage({ ...result, status }).text).toBe('I could not handle that message yet.');
});
test('viewer question heuristic and API error copy match web', () => {
  expect(looksLikeFinanceQuestion('How much did I spend?')).toBe(true);
  expect(looksLikeFinanceQuestion('petrol 250')).toBe(false);
  expect(assistantError(new ApiError('Server error'))).toBe('Server error');
  expect(assistantError(null)).toBe('Could not reach the Spndrr API. Check that the backend is running.');
});
async function setup(data: unknown) {
  const requests: HttpRequest[] = [];
  const client = new FinanceClient(async request => {
    requests.push(request);
    return { status: 200, data: request.path === '/api/auth/login' ? { accessToken: 'token', accessTokenExpiresAt: '2099-01-01', requiresPrivacyConsent: false, user: { id: 'u', displayName: 'Person' } } : data };
  }, async () => {});
  await client.login('person@example.test', 'password');
  return { client, requests };
}
test.each([undefined, '2026-11-10'])('sendAssistant matches web path and exact request body (date %s)', async date => {
  const { client, requests } = await setup(result);
  const input = buildAssistantRequest(' food 180 ', 'INR', 'home', date);
  expect(await client.sendAssistant(input)).toEqual(result);
  expect(requests[1]).toEqual({ path: '/api/assistant/messages', method: 'POST', body: input, headers: { Authorization: 'Bearer token' } });
});
test('optional fields and Voice are passed through without invented defaults', async () => {
  const { client, requests } = await setup(result);
  const input = { text: 'food 180', inputMode: 'Voice' as const };
  await client.sendAssistant(input);
  expect(requests[1].body).toEqual(input);
});
test.each([null, { ...result, status: 'Unknown' }, { ...result, transaction: {} }, { ...result, assistantMessage: 42 }, { ...result, errors: null }])('unverified response cannot become confirmation: %j', async data => {
  const { client } = await setup(data);
  await expect(client.sendAssistant(buildAssistantRequest('food 180', 'INR', 'home'))).rejects.toMatchObject({ outcome: 'unknown' });
});
test.each(['', ' '.repeat(5), 'a'.repeat(4001)])('invalid input does not call assistant transport', async text => {
  const { client, requests } = await setup(result);
  await expect(client.sendAssistant(buildAssistantRequest(text, 'INR', null))).rejects.toThrow('Enter a message of up to 4000 characters.');
  expect(requests).toHaveLength(1);
});
