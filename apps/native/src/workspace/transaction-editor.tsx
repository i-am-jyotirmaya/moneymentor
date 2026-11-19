import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { CategoryCatalog, EventKind, FinancialAccount, PaymentChannel, Transaction, Visibility } from '../api/models';
import { useSession } from '../auth/session';
import { AndroidKeyboardFrame } from '../ui/AndroidKeyboardFrame';
import { styles } from '../ui/theme';
import { formatTone } from '../lib/format';
import { Action, Choice, ErrorNotice, ws } from './ui';
import { categoryRows, isIncomeKind, isTransferKind, type TransactionEditForm } from './transactions-data';

function EditorSheet({ children, onClose, visible = true, maxHeight = '85%' }: { children: ReactNode; onClose: () => void; visible?: boolean; maxHeight?: '85%' | '90%' }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); onClose(); }}>
    <SafeAreaProvider><AndroidKeyboardFrame><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={ws.scrim}><SafeAreaView accessibilityViewIsModal edges={['left', 'right', 'bottom']} style={{ maxHeight, backgroundColor: 'white' }}>{children}</SafeAreaView></View>
    </KeyboardAvoidingView></AndroidKeyboardFrame></SafeAreaProvider>
  </Modal>;
}

function AccountChoice({ label, value, options, disabled, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => { Keyboard.dismiss(); setOpen(false); };
  return <><Action title={options.find(option => option.value === value)?.label ?? value} label={label} disabled={disabled} onPress={() => { Keyboard.dismiss(); setQuery(''); setOpen(true); }} /><EditorSheet visible={open} onClose={close}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}><Text style={ws.heading}>{label}</Text><TextInput style={styles.input} accessibilityLabel={`Search ${label.toLowerCase()}`} placeholder="Search options" value={query} onChangeText={setQuery} />{matches.map(option => <Action key={option.value} title={option.label} selected={value === option.value} onPress={() => { onChange(option.value); close(); }} />)}{!matches.length ? <Text style={styles.text}>No matching options.</Text> : null}<Action title="Close" onPress={close} /></ScrollView></EditorSheet></>;
}

export function TransactionEditor({ transaction, catalog, form, setForm, saving, error, close, save, onDelete }: {
  transaction: Transaction; catalog: CategoryCatalog | null; form: TransactionEditForm; setForm: (f: TransactionEditForm) => void;
  saving: boolean; error: string | null; close: () => void; save: () => void;
  /** D5: Delete lives at the bottom of the editor (the row itself is a single tap target). */
  onDelete?: () => void;
}) {
  const { client } = useSession();
  const [attempt, setAttempt] = useState(0);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let current = true;
    void client.accounts(transaction.householdId).then(rows => { if (current) setAccounts(rows); }).catch(e => { if (current) setAccountError(e instanceof Error ? e.message : 'Unable to load accounts.'); });
    return () => { current = false; };
  }, [client, transaction.householdId, attempt]);
  const transfer = isTransferKind(form.kind);
  const income = isIncomeKind(form.kind);
  const field = (label: string, key: 'amount' | 'merchantName' | 'description' | 'senderName' | 'reason' | 'transactionDate') => <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} editable={!saving} value={form[key]} onChangeText={value => setForm({ ...form, [key]: value })} keyboardType={key === 'amount' ? 'decimal-pad' : 'default'} placeholder={key === 'transactionDate' ? 'YYYY-MM-DD' : undefined} /></View>;
  const options = (values: string[]) => values.map(value => ({ value, label: formatTone(value) }));
  const accountOptions = (destination = false) => [{ value: '', label: 'Unspecified' }, ...accounts.filter(a => (a.isActive || a.id === (destination ? form.counterpartyAccountId : form.accountId)) && (!destination || a.id !== form.accountId)).map(a => ({ value: a.id, label: a.name }))];
  const rows = categoryRows(catalog?.categories ?? [], income, search);
  const closeEditor = () => { Keyboard.dismiss(); close(); };
  const closeCategory = () => { Keyboard.dismiss(); setCategoryOpen(false); };
  return <EditorSheet onClose={closeEditor} maxHeight="90%">
    <View style={ws.content}><View style={ws.row}><Text style={ws.heading}>Edit transaction</Text><Action title="×" label="Close transaction editor" onPress={closeEditor} /></View><Text style={styles.text}>Last edited by {transaction.updatedByDisplayName ?? 'Spndrr'}</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Text style={styles.label}>Financial event</Text><Choice label="Financial event" value={form.kind} disabled={saving || !!transaction.relatedTransactionId || ['Refund', 'Reversal'].includes(form.kind)} options={options(['Purchase', 'Income', 'Transfer', 'CreditCardPayment', 'Cashback', 'Fee', 'Interest', 'CashWithdrawal', 'Investment', ...(['Refund', 'Reversal'].includes(form.kind) ? [form.kind] : [])])} onChange={value => setForm({ ...form, kind: value as EventKind, categoryId: null, categoryName: '', counterpartyAccountId: null })} />
      <Text style={styles.label}>{transfer ? 'Source account (optional)' : 'Account (optional)'}</Text><AccountChoice label={transfer ? 'Source account (optional)' : 'Account (optional)'} value={form.accountId ?? ''} disabled={saving || !!accountError} options={accountOptions()} onChange={value => setForm({ ...form, accountId: value || null })} />
      {transfer ? <><Text style={styles.label}>Destination account (optional)</Text><AccountChoice label="Destination account (optional)" value={form.counterpartyAccountId ?? ''} disabled={saving || !!accountError} options={accountOptions(true)} onChange={value => setForm({ ...form, counterpartyAccountId: value || null })} /></> : null}
      <ErrorNotice error={accountError} retry={() => { setAccountError(null); setAttempt(n => n + 1); }} />
      <Text style={styles.label}>Payment channel (optional)</Text><Choice label="Payment channel (optional)" value={form.paymentChannel} disabled={saving} options={options(['Unknown', 'UPI', 'Card', 'Cash', 'BankTransfer', 'AutoDebit', 'Wallet', 'Cheque'])} onChange={value => setForm({ ...form, paymentChannel: value as PaymentChannel })} />
      {field('Amount', 'amount')}
      <Text style={styles.label}>Category</Text><Action title={form.categoryName ? `${form.categoryName}${form.categoryId ? '' : ' (current category)'}` : 'Choose a category'} disabled={saving || !catalog || !!transaction.relatedTransactionId || transfer} onPress={() => { Keyboard.dismiss(); setCategoryOpen(true); }} /><Text style={ws.small}>Choose a category from its group.</Text>
      {income ? <>{field('Sender', 'senderName')}{field('Reason', 'reason')}</> : <>{field('Merchant', 'merchantName')}{field('Description', 'description')}</>}
      {field('Transaction date', 'transactionDate')}
      <Text style={styles.label}>Visibility</Text><Choice label="Visibility" value={form.visibility} disabled={saving} options={options(['Private', 'Household'])} onChange={value => setForm({ ...form, visibility: value as Visibility })} />
    <View style={ws.content}><Action write testID="transaction-edit-save" title={saving ? 'Saving...' : 'Save transaction'} disabled={saving} onPress={save} />{onDelete ? <Action write testID="transaction-edit-delete" title="Delete transaction" label="Delete transaction" disabled={saving} onPress={onDelete} /> : null}</View>
    </ScrollView>
    <EditorSheet visible={categoryOpen} onClose={closeCategory}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}><Text style={ws.heading}>Category</Text><TextInput accessibilityLabel="Search categories" placeholder="Search a category or group" value={search} onChangeText={setSearch} style={styles.input} />{rows.map(row => <View key={row.value} style={{ paddingLeft: row.depth * 16 }}>{row.selectable ? <Action title={row.label} onPress={() => { setForm({ ...form, categoryId: row.value, categoryName: row.label }); closeCategory(); setSearch(''); }} /> : <Text style={styles.label}>{row.label}</Text>}</View>)}{!rows.some(row => row.selectable) ? <Text style={styles.text}>{categoryRows(catalog?.categories ?? [], income).some(row => row.selectable) ? 'No matching categories. Try another search.' : 'No categories available. Your current category will be kept.'}</Text> : null}<Action title="Close" onPress={closeCategory} /></ScrollView></EditorSheet>
  </EditorSheet>;
}
