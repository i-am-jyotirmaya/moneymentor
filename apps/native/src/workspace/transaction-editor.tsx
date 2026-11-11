import { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryCatalog, EventKind, FinancialAccount, PaymentChannel, Transaction, Visibility } from '../api/models';
import { useSession } from '../auth/session';
import { styles } from '../ui/theme';
import { formatTone } from '../lib/format';
import { Action, Choice, ws } from './ui';
import { categoryRows, isIncomeKind, isTransferKind, type TransactionEditForm } from './transactions-data';

function AccountChoice({ label, value, options, disabled, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <><Action title={options.find(option => option.value === value)?.label ?? value} label={label} disabled={disabled} onPress={() => { setQuery(''); setOpen(true); }} /><Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}><View style={ws.scrim}><SafeAreaView style={{ maxHeight: '85%', backgroundColor: 'white' }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}><Text style={ws.heading}>{label}</Text><TextInput style={styles.input} accessibilityLabel={`Search ${label.toLowerCase()}`} placeholder="Search options" value={query} onChangeText={setQuery} />{matches.map(option => <Action key={option.value} title={option.label} selected={value === option.value} onPress={() => { onChange(option.value); setOpen(false); }} />)}{!matches.length ? <Text style={styles.text}>No matching options.</Text> : null}<Action title="Close" onPress={() => setOpen(false)} /></ScrollView></SafeAreaView></View></Modal></>;
}

export function TransactionEditor({ transaction, catalog, form, setForm, saving, error, close, save }: {
  transaction: Transaction; catalog: CategoryCatalog | null; form: TransactionEditForm; setForm: (f: TransactionEditForm) => void;
  saving: boolean; error: string | null; close: () => void; save: () => void;
}) {
  const { client } = useSession();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let current = true;
    void client.accounts(transaction.householdId).then(rows => { if (current) setAccounts(rows); }).catch(e => { if (current) setAccountError(e instanceof Error ? e.message : 'Unable to load accounts.'); });
    return () => { current = false; };
  }, [client, transaction.householdId]);
  const transfer = isTransferKind(form.kind);
  const income = isIncomeKind(form.kind);
  const field = (label: string, key: 'amount' | 'merchantName' | 'description' | 'senderName' | 'reason' | 'transactionDate') => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} editable={!saving} value={form[key]} onChangeText={value => setForm({ ...form, [key]: value })} keyboardType={key === 'amount' ? 'decimal-pad' : 'default'} placeholder={key === 'transactionDate' ? 'YYYY-MM-DD' : undefined} /></View>;
  const options = (values: string[]) => values.map(value => ({ value, label: formatTone(value) }));
  const accountOptions = (destination = false) => [{ value: '', label: 'Unspecified' }, ...accounts.filter(a => (a.isActive || a.id === (destination ? form.counterpartyAccountId : form.accountId)) && (!destination || a.id !== form.accountId)).map(a => ({ value: a.id, label: a.name }))];
  const rows = categoryRows(catalog?.categories ?? [], income, search);
  return <Modal transparent animationType="slide" onRequestClose={close}><View style={ws.scrim}><SafeAreaView style={{ maxHeight: '90%', backgroundColor: 'white' }}>
    <View style={ws.content}><View style={ws.row}><Text style={ws.heading}>Edit transaction</Text><Action title="×" label="Close transaction editor" onPress={close} /></View><Text style={styles.text}>Last edited by {transaction.updatedByDisplayName ?? 'Spndrr'}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Financial event</Text><Choice label="Financial event" value={form.kind} disabled={saving || !!transaction.relatedTransactionId || ['Refund', 'Reversal'].includes(form.kind)} options={options(['Purchase', 'Income', 'Transfer', 'CreditCardPayment', 'Cashback', 'Fee', 'Interest', 'CashWithdrawal', 'Investment', ...(['Refund', 'Reversal'].includes(form.kind) ? [form.kind] : [])])} onChange={value => setForm({ ...form, kind: value as EventKind, categoryId: null, categoryName: '', counterpartyAccountId: null })} />
      <Text style={styles.label}>{transfer ? 'Source account (optional)' : 'Account (optional)'}</Text><AccountChoice label={transfer ? 'Source account (optional)' : 'Account (optional)'} value={form.accountId ?? ''} disabled={saving || !!accountError} options={accountOptions()} onChange={value => setForm({ ...form, accountId: value || null })} />
      {transfer ? <><Text style={styles.label}>Destination account (optional)</Text><AccountChoice label="Destination account (optional)" value={form.counterpartyAccountId ?? ''} disabled={saving || !!accountError} options={accountOptions(true)} onChange={value => setForm({ ...form, counterpartyAccountId: value || null })} /></> : null}
      {accountError ? <Text accessibilityRole="alert" style={styles.error}>{accountError}</Text> : null}
      <Text style={styles.label}>Payment channel (optional)</Text><Choice label="Payment channel (optional)" value={form.paymentChannel} disabled={saving} options={options(['Unknown', 'UPI', 'Card', 'Cash', 'BankTransfer', 'AutoDebit', 'Wallet', 'Cheque'])} onChange={value => setForm({ ...form, paymentChannel: value as PaymentChannel })} />
      {field('Amount', 'amount')}
      <Text style={styles.label}>Category</Text><Action title={form.categoryName ? `${form.categoryName}${form.categoryId ? '' : ' (current category)'}` : 'Choose a category'} disabled={saving || !catalog || !!transaction.relatedTransactionId || transfer} onPress={() => setCategoryOpen(true)} /><Text style={ws.small}>Choose a category from its group.</Text>
      {income ? <>{field('Sender', 'senderName')}{field('Reason', 'reason')}</> : <>{field('Merchant', 'merchantName')}{field('Description', 'description')}</>}
      {field('Transaction date', 'transactionDate')}
      <Text style={styles.label}>Visibility</Text><Choice label="Visibility" value={form.visibility} disabled={saving} options={options(['Private', 'Household'])} onChange={value => setForm({ ...form, visibility: value as Visibility })} />
    </ScrollView>
    <View style={ws.content}><Action testID="transaction-edit-save" title={saving ? 'Saving...' : 'Save transaction'} disabled={saving} onPress={save} /></View>
    <Modal visible={categoryOpen} transparent animationType="slide" onRequestClose={() => setCategoryOpen(false)}><View style={ws.scrim}><SafeAreaView style={{ maxHeight: '85%', backgroundColor: 'white' }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}><Text style={ws.heading}>Category</Text><TextInput accessibilityLabel="Search categories" placeholder="Search a category or group" value={search} onChangeText={setSearch} style={styles.input} />{rows.map(row => <View key={row.value} style={{ paddingLeft: row.depth * 16 }}>{row.selectable ? <Action title={row.label} onPress={() => { setForm({ ...form, categoryId: row.value, categoryName: row.label }); setCategoryOpen(false); setSearch(''); }} /> : <Text style={styles.label}>{row.label}</Text>}</View>)}{!rows.some(row => row.selectable) ? <Text style={styles.text}>{categoryRows(catalog?.categories ?? [], income).some(row => row.selectable) ? 'No matching categories. Try another search.' : 'No categories available. Your current category will be kept.'}</Text> : null}<Action title="Close" onPress={() => setCategoryOpen(false)} /></ScrollView></SafeAreaView></View></Modal>
  </SafeAreaView></View></Modal>;
}
