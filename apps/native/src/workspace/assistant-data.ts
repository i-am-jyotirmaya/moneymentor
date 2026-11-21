import { ApiError } from '../api/client';
import type { AssistantResponse, Transaction } from '../api/models';

export type AssistantMessage = { role: 'user' | 'assistant'; text: string; addedToTransactions?: true; transaction?: Transaction; undone?: true };
export function initialAssistantMessages(): AssistantMessage[] {
  return [{ role: 'assistant', text: 'Tell me what you spent or received, or ask where your money went this month.' }];
}
export function userMessage(text: string): AssistantMessage {
  return { role: 'user', text: text.trim() };
}
export function buildAssistantRequest(text: string, currencyCode: string, householdId: string | null, transactionDate?: string, inputMode: 'Text' | 'Voice' = 'Text') {
  return { text: text.trim(), inputMode, householdId: householdId ?? undefined,
    currencyCode, locale: 'en-IN', ...(transactionDate === undefined ? {} : { transactionDate }) };
}
export function responseMessage(result: AssistantResponse): AssistantMessage {
  return { role: 'assistant', text: result.assistantMessage ?? (result.status === 'NeedsClarification'
    ? 'I need a little more detail before saving this.' : result.transaction ? 'Tracked that expense.' : 'I could not handle that message yet.'),
    ...(result.status === 'Responded' && result.transaction ? { addedToTransactions: true, transaction: result.transaction } : {}) };
}
export function looksLikeFinanceQuestion(text: string) {
  return /\b(where|what|which|how much|spent most|total|summary|report)\b/i.test(text);
}
export function assistantError(error: unknown) {
  return error instanceof ApiError ? error.errors.join(' ') : 'Could not reach the Spndrr API. Check that the backend is running.';
}

/** The empty state shows until the user has sent something. */
export function hasConversation(messages: AssistantMessage[]) {
  return messages.some(m => m.role === 'user');
}
export const logExamples = ['Spent 450 on groceries at More', 'Got salary 1,24,500 today', 'Paid 1,200 for Netflix and Spotify'] as const;
export const askExamples = ['Where did my money go?', 'How much on dining?'] as const;
