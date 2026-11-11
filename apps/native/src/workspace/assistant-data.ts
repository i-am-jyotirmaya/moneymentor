import { ApiError } from '../api/client';
import type { AssistantResponse } from '../api/models';

export type AssistantMessage = { role: 'user' | 'assistant'; text: string };
export function initialAssistantMessages(): AssistantMessage[] {
  return [{ role: 'assistant', text: 'Tell me what you spent or received, or ask where your money went this month.' }];
}
export function userMessage(text: string): AssistantMessage {
  return { role: 'user', text: text.trim() };
}
export function buildAssistantRequest(text: string, currencyCode: string, householdId: string | null, transactionDate?: string) {
  return { text: text.trim(), inputMode: 'Text' as const, householdId: householdId ?? undefined,
    currencyCode, locale: 'en-IN', ...(transactionDate === undefined ? {} : { transactionDate }) };
}
export function responseMessage(result: AssistantResponse): AssistantMessage {
  return { role: 'assistant', text: result.assistantMessage ?? (result.status === 'NeedsClarification'
    ? 'I need a little more detail before saving this.' : result.transaction ? 'Tracked that expense.' : 'I could not handle that message yet.') };
}
export function looksLikeFinanceQuestion(text: string) {
  return /\b(where|what|which|how much|spent most|total|summary|report)\b/i.test(text);
}
export function assistantError(error: unknown) {
  return error instanceof ApiError ? error.errors.join(' ') : 'Could not reach the Spndrr API. Check that the backend is running.';
}
