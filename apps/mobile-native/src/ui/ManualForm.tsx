import { useState } from 'react';
import { Keyboard, Platform, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { categoryOptions, type EntryResources, type ManualDraft } from '@spndrr/finance-core';
import { Button, Field, Selection, styles } from './primitives';

export function ManualForm({ draft, resources, disabled, errors = {}, onChange, onSelect, editing = false }: {
  draft: ManualDraft; resources: EntryResources; disabled: boolean; errors?: Record<string, string>;
  onChange: (change: Partial<ManualDraft>) => void;
  onSelect: (kind: 'account' | 'category' | 'payment' | 'visibility') => void; editing?: boolean;
}) {
  const [showDate, setShowDate] = useState(false);
  const account = resources.accounts.find(a => a.id === draft.accountId);
  const category = categoryOptions(resources.categories, draft.eventKind === 'Income' ? 'Income' : 'Expense').find(c => c.id === draft.categoryId);
  const localDate = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12); };
  const changeDate = (value?: Date) => { if (value) onChange({ date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }); };
  const chooseDate = () => {
    Keyboard.dismiss();
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value: localDate(draft.date), mode: 'date', maximumDate: localDate(resources.today), onChange: (_, date) => changeDate(date) });
    else setShowDate(previous => !previous);
  };
  return <View style={{ gap: 18 }}>
    {!editing ? <View style={styles.row}>
      <Button title="Expense" onPress={() => onChange({ eventKind: 'Purchase', categoryId: null })} disabled={disabled} selected={draft.eventKind === 'Purchase'} secondary={draft.eventKind !== 'Purchase'} />
      <Button title="Income" onPress={() => onChange({ eventKind: 'Income', categoryId: null })} disabled={disabled} selected={draft.eventKind === 'Income'} secondary={draft.eventKind !== 'Income'} />
    </View> : <Text style={styles.caption}>Editing {draft.eventKind === 'Income' ? 'income' : 'expense'} · Financial type is preserved.</Text>}
    <Field label={`Amount (${resources.settings.currencyCode})`} value={draft.amount} onChangeText={amount => onChange({ amount })}
      editable={!disabled} keyboardType="decimal-pad" inputMode="decimal" maxLength={15} placeholder="0.00" error={errors.amount} testID="amount-input" style={{ fontSize: 32, fontWeight: '600', minHeight: 76 }} />
    <Selection label="Category" value={category?.label ?? 'Choose category or subcategory'} onPress={() => onSelect('category')} disabled={disabled} error={errors.categoryId} />
    <Selection label="Account" value={account ? `${account.name} · ${account.accountType === 'CreditCard' ? 'Credit card' : account.accountType === 'BankAccount' ? 'Bank account' : account.accountType}` : 'Choose payment account'}
      onPress={() => onSelect('account')} disabled={disabled} error={errors.accountId} />
    <Text style={styles.caption}>The selected account is used exactly as shown. Payment method is a separate field.</Text>
    <Selection label="Payment method" value={draft.paymentChannel === 'Unknown' ? 'Not specified' : draft.paymentChannel} onPress={() => onSelect('payment')} disabled={disabled} />
    <Selection label="Transaction date" value={draft.date} onPress={chooseDate} disabled={disabled} error={errors.date} />
    {showDate && !disabled ? <DateTimePicker accessibilityLabel="Choose transaction date" value={localDate(draft.date)} maximumDate={localDate(resources.today)} mode="date" display="inline" onChange={(_, value) => changeDate(value)} /> : null}
    <Field label={draft.eventKind === 'Income' ? 'From (optional)' : 'Merchant (optional)'} value={draft.merchant} onChangeText={merchant => onChange({ merchant })} editable={!disabled} maxLength={256} error={errors.merchant} />
    <Field label="Note (optional)" testID="note-input" value={draft.description} onChangeText={description => onChange({ description })} editable={!disabled} maxLength={1024} multiline error={errors.description} />
    <Selection label="Visibility" value={draft.visibility === 'Private' ? 'Only me' : 'Household members'} onPress={() => onSelect('visibility')} disabled={disabled} />
  </View>;
}
