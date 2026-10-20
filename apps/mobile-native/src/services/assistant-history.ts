export type AssistantExchange = { id: string; text: string; reply: string; date: string; transactionId: string | null; previewOnly: boolean };
export type AssistantHistory = { version: 1; ownerId: string; householdId: string; exchanges: AssistantExchange[] };
export function decodeAssistantHistory(value: unknown, ownerId: string, householdId: string): AssistantExchange[] | null {
  const history = value as AssistantHistory | null;
  if (!history || history.version !== 1 || history.ownerId !== ownerId || history.householdId !== householdId || !Array.isArray(history.exchanges) || history.exchanges.length > 12
    || history.exchanges.some(item => !item || typeof item.id !== 'string' || typeof item.text !== 'string' || typeof item.reply !== 'string' || typeof item.date !== 'string'
      || (item.transactionId !== null && typeof item.transactionId !== 'string') || typeof item.previewOnly !== 'boolean')) return null;
  return history.exchanges;
}
/** Bound the encrypted local preview; the backend has no conversation-history endpoint. */
export function appendAssistantHistory(previous: AssistantExchange[], exchange: Omit<AssistantExchange, 'previewOnly'>): AssistantExchange[] {
  const text = Array.from(exchange.text); const reply = Array.from(exchange.reply);
  const item = { ...exchange, text: text.slice(0, 4000).join(''), reply: reply.slice(0, 4000).join(''), previewOnly: text.length > 4000 || reply.length > 4000 };
  const next = [...previous, item].slice(-12);
  while (next.length > 1 && JSON.stringify(next).length > 12000) next.shift();
  while (JSON.stringify(next).length > 12000) {
    item.text = Array.from(item.text).slice(0, Math.max(0, Array.from(item.text).length - 500)).join('');
    item.reply = Array.from(item.reply).slice(0, Math.max(0, Array.from(item.reply).length - 500)).join('');
    item.previewOnly = true;
  }
  return next;
}
