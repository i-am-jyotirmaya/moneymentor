import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useQuery } from '@tanstack/react-query';
import { buildFinancialEventIntent, categoryOptions, ValidationError, type EventKind, type FinancialEventDraft, type PaymentChannel, type Visibility } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, styles } from '../ui/primitives';
import { CalendarField, ChoiceField, MoneyField, Page, Toggle } from '../ui/forms';
import { choices } from '../ui/workspace';
import type { ScreenProps } from '../navigation';

export function FinancialEventScreen({ navigation, route }: ScreenProps<'FinancialEvent'>) {
  const entry = useEntry(); const { api, scope, currency, today } = useWorkspace(); const mutation = useWorkspaceMutation();
  const originalId = route.params?.originalId;
  const original = useQuery({ queryKey: ['transaction', scope, originalId], queryFn: () => api.transaction(originalId!), enabled: !!originalId });
  const [reference] = useState(() => `native:${Crypto.randomUUID()}`);
  const [saved, setSaved] = useState(false); const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<FinancialEventDraft>({ eventKind: route.params?.kind ?? 'Transfer', amount: '', date: today, accountId: null, counterpartyAccountId: null,
    categoryId: null, merchant: '', description: '', paymentChannel: 'BankTransfer', visibility: entry.resources.settings.defaultTransactionVisibility, unlinkedRefund: false });
  useEffect(() => { const item = original.data; if (item && item.householdId === scope) setDraft(previous => ({ ...previous, accountId: item.accountId ?? null, amount: String(item.amount), visibility: item.visibility })); }, [original.data, scope]);
  const change = (patch: Partial<FinancialEventDraft>) => setDraft(previous => ({ ...previous, ...patch }));
  const paired = ['Transfer', 'CreditCardPayment', 'CashWithdrawal'].includes(draft.eventKind);
  const submit = () => {
    setErrors({}); mutation.setError(null);
    try {
      const intent = buildFinancialEventIntent(draft, entry.resources, reference, original.data);
      void mutation.execute('Save financial event', () => entry.client.createFinancialEvent(intent), item => { entry.setSaved(item); setSaved(true); });
    } catch (caught) { if (caught instanceof ValidationError) setErrors(caught.fields); mutation.setError(caught instanceof Error ? caught.message : 'Check the event details.'); }
  };
  const accounts = entry.resources.accounts.filter(item => item.isActive && item.currencyCode === currency).map(item => ({ id: item.id, label: item.name, detail: item.accountType }));
  return <Page title="Transfer or adjustment" error={mutation.error}>
    <OperationNotice refresh={mutation.refresh} />
    {saved ? <Card><Text accessibilityLiveRegion="polite" style={styles.heading}>Financial event saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></Card> : originalId && original.isPending ? <Loading /> : originalId && (original.isError || original.data?.householdId !== scope) ? <ErrorNotice message="The original event could not be loaded in this household." onRetry={() => { void original.refetch(); }} /> : <>
      <Text style={styles.caption}>Transfers and credit card payments move money between accounts. Spndrr calculates their effect on spending; they are never entered as a second purchase.</Text>
      {original.data ? <Card><Text style={styles.heading}>Linked original</Text><Text style={styles.body}>{original.data.description ?? original.data.kind} · {original.data.accountName}</Text></Card> : null}
      <ChoiceField label="Event" value={draft.eventKind} options={choices(originalId ? ['Refund', 'Reversal'] : ['Transfer', 'CreditCardPayment', 'CashWithdrawal', 'Refund', 'Cashback', 'Fee', 'Interest', 'Investment'])}
        onChange={value => change({ eventKind: value as EventKind, counterpartyAccountId: null, categoryId: null, unlinkedRefund: false })} disabled={mutation.blocked} />
      <MoneyField label="Amount" currency={currency} value={draft.amount} onChange={amount => change({ amount })} disabled={mutation.blocked} error={errors.amount} />
      <CalendarField label="Date" today={today} value={draft.date} onChange={date => change({ date })} disabled={mutation.blocked} />
      <ChoiceField label={paired ? 'From account' : 'Account'} value={draft.accountId} options={accounts} onChange={accountId => change({ accountId })} disabled={mutation.blocked || !!originalId} error={errors.accountId} />
      {paired ? <ChoiceField label="To account" value={draft.counterpartyAccountId} options={accounts} onChange={counterpartyAccountId => change({ counterpartyAccountId })} disabled={mutation.blocked} error={errors.counterpartyAccountId} /> : null}
      {!originalId && ['Refund', 'Fee', 'Interest', 'Investment'].includes(draft.eventKind) ? <ChoiceField label="Category" value={draft.categoryId} options={categoryOptions(entry.resources.categories, 'Expense').map(item => ({ id: item.id, label: item.label }))} onChange={categoryId => change({ categoryId })} disabled={mutation.blocked} error={errors.categoryId} /> : null}
      {!originalId && draft.eventKind === 'Refund' ? <Toggle label="This refund has no linked original" detail="To link a refund, open the original purchase in transaction history." value={draft.unlinkedRefund} onChange={unlinkedRefund => change({ unlinkedRefund })} disabled={mutation.blocked} /> : null}
      <ChoiceField label="Payment method" value={draft.paymentChannel} options={choices(['UPI', 'Card', 'Cash', 'BankTransfer', 'AutoDebit', 'Wallet', 'Cheque', 'Unknown'])} onChange={paymentChannel => change({ paymentChannel: paymentChannel as PaymentChannel })} disabled={mutation.blocked} />
      <ChoiceField label="Visibility" value={draft.visibility} options={choices(['Private', 'Household'])} onChange={visibility => change({ visibility: visibility as Visibility })} disabled={mutation.blocked || !!originalId} />
      <Field label="Merchant (optional)" value={draft.merchant} onChangeText={merchant => change({ merchant })} maxLength={256} editable={!mutation.blocked} />
      <Field label="Note (optional)" value={draft.description} onChangeText={description => change({ description })} maxLength={1024} multiline editable={!mutation.blocked} />
      <Button title="Save financial event" disabled={mutation.blocked} loading={mutation.busy} onPress={submit} />
    </>}
  </Page>;
}
