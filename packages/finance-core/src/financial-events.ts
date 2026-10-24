import { categoryOptions, isValidDate, parseMoney, ValidationError, type EntryResources } from './finance.ts';
import type { EventKind, FinancialEventIntent, PaymentChannel, Transaction, Visibility } from './models.ts';

export type FinancialEventDraft = {
  eventKind: EventKind; amount: string; date: string; accountId: string | null;
  counterpartyAccountId: string | null; categoryId: string | null; merchant: string;
  description: string; paymentChannel: PaymentChannel; visibility: Visibility;
  unlinkedRefund: boolean;
};
const kinds: EventKind[] = ['Purchase', 'Income', 'Refund', 'Transfer', 'CreditCardPayment', 'Reversal', 'Cashback', 'Fee', 'Interest', 'CashWithdrawal', 'Investment'];
const paired: EventKind[] = ['Transfer', 'CreditCardPayment', 'CashWithdrawal'];
const categorized: EventKind[] = ['Purchase', 'Income', 'Refund', 'Fee', 'Interest', 'Investment'];

/** Preserve financial meaning and exact account identities; the backend calculates impact. */
export function buildFinancialEventIntent(draft: FinancialEventDraft, resources: EntryResources, reference: string, original?: Transaction): Readonly<FinancialEventIntent> {
  const errors: Record<string, string> = {};
  const cents = parseMoney(draft.amount);
  if (cents === null) errors.amount = 'Enter a positive amount with up to two decimal places.';
  if (!kinds.includes(draft.eventKind)) errors.eventKind = 'Choose a supported financial event.';
  if (!isValidDate(draft.date, resources.today)) errors.date = 'Use a real date no later than today.';
  if (!resources.canWrite) errors.scope = 'You cannot change this household.';
  const validAccount = (accountId: string | null) => resources.accounts.find(account => account.id === accountId
    && account.isActive && account.householdId === resources.householdId && account.currencyCode === resources.settings.currencyCode);
  const from = validAccount(draft.accountId); const to = validAccount(draft.counterpartyAccountId);
  if (!from) errors.accountId = 'Choose an active account in this household and currency.';
  if (paired.includes(draft.eventKind)) {
    if (!to) errors.counterpartyAccountId = 'Choose the destination account.';
    if (from && from.id === to?.id) errors.counterpartyAccountId = 'Source and destination must differ.';
    if (draft.eventKind === 'CreditCardPayment' && (from?.accountType === 'CreditCard' || to?.accountType !== 'CreditCard')) errors.counterpartyAccountId = 'Pay from an asset account to the credit card.';
    if (draft.eventKind === 'CashWithdrawal' && to?.accountType !== 'Cash') errors.counterpartyAccountId = 'Choose a cash account for the withdrawal.';
  } else if (draft.counterpartyAccountId && draft.eventKind !== 'Reversal') errors.counterpartyAccountId = 'This event has no destination account.';
  if (['Refund', 'Reversal'].includes(draft.eventKind)) {
    if (!original && (draft.eventKind === 'Reversal' || !draft.unlinkedRefund)) errors.original = 'Select the original event or explicitly choose an unlinked refund.';
    if (original) {
      if (original.householdId !== resources.householdId || original.currencyCode !== resources.settings.currencyCode
        || original.deletedAt || original.kind === 'Reversal') errors.original = 'Choose an active original event in this household and currency.';
      if (original.accountId && original.accountId !== draft.accountId) errors.accountId = 'Use the original event’s account.';
      if (original.transactionDate.slice(0, 10) > draft.date) errors.date = 'An adjustment cannot precede its original event.';
      if (cents !== null && cents > Math.round(original.amount * 100)) errors.amount = 'The adjustment cannot exceed the original amount. The server checks prior adjustments.';
      if (draft.eventKind === 'Refund' && !['Purchase', 'Fee', 'Interest'].includes(original.kind ?? (original.type === 'Expense' ? 'Purchase' : ''))) errors.original = 'Refunds must link to a purchase, fee or interest charge.';
    }
  } else if (original) errors.original = 'Only a refund or reversal can link to an original event.';
  if (!original && categorized.includes(draft.eventKind)
    && !categoryOptions(resources.categories, draft.eventKind === 'Income' ? 'Income' : 'Expense').some(option => option.id === draft.categoryId)) errors.categoryId = 'Choose an available category.';
  if (draft.description.length > 1024 || draft.merchant.length > 256) errors.description = 'Shorten the note or merchant name.';
  if (!['Private', 'Household'].includes(draft.visibility)) errors.visibility = 'Choose a supported visibility.';
  if (!['UPI', 'Card', 'Cash', 'BankTransfer', 'AutoDebit', 'Wallet', 'Cheque', 'Unknown'].includes(draft.paymentChannel)) errors.paymentChannel = 'Choose a supported payment method.';
  if (!/^native:[a-zA-Z0-9-]{8,100}$/.test(reference)) errors.reference = 'Start a new operation to create a valid reference.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return Object.freeze({ eventKind: draft.eventKind, amount: cents! / 100, date: draft.date,
    accountId: from!.id, householdId: resources.householdId,
    ...(paired.includes(draft.eventKind) ? { counterpartyAccountId: to!.id } : draft.eventKind === 'Reversal' && original?.counterpartyAccountId ? { counterpartyAccountId: original.counterpartyAccountId } : {}),
    ...(!original && categorized.includes(draft.eventKind) ? { categoryId: draft.categoryId! } : {}),
    ...(original ? { relatedTransactionId: original.id } : {}), matchOriginal: false,
    merchant: draft.merchant.trim() || null, description: draft.description.trim() || null,
    sourceText: '', paymentChannel: draft.paymentChannel, visibility: original?.visibility ?? draft.visibility,
    inputMode: 'Text', externalReference: reference, confidence: 1 });
}
