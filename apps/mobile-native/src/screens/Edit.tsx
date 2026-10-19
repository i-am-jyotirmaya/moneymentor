import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, buildTransactionIntent, ValidationError, type Transaction, type TransactionPatch } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { Button, ErrorNotice, styles } from '../ui/primitives';
import { ManualForm } from '../ui/ManualForm';
import type { ScreenProps } from '../navigation';

export function EditScreen({ navigation }: ScreenProps<'Edit'>) {
  const entry = useEntry();
  const query = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unknown, setUnknown] = useState(false);
  const [saved, setSaved] = useState(false);
  const baseline = useRef(JSON.stringify(entry.edit?.manual));
  const dirty = JSON.stringify(entry.edit?.manual) !== baseline.current;
  usePreventRemove((dirty || unknown) && !saved, ({ data }) => {
    Alert.alert(unknown ? 'Update not confirmed' : 'Keep your changes?', unknown ? 'The update may already be saved. Reload the transaction before making another change.' : 'Your unsaved edits will be discarded.',
      [{ text: 'Keep editing', style: 'cancel' }, { text: 'Close editor', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  if (!entry.edit) return <SafeAreaView style={styles.screen}><ErrorNotice message="Open a transaction from recent history to edit it." /></SafeAreaView>;
  const { transaction, manual } = entry.edit;
  const submit = () => { void entry.runExclusive(async () => {
    setError(null); setErrors({});
    try {
      const intent = buildTransactionIntent(manual, entry.resources, 'native:validate-edit');
      const patch: TransactionPatch = { amount: intent.amount, transactionDate: intent.date, categoryId: intent.categoryId, accountId: intent.accountId,
        merchantName: manual.merchant.trim(), description: manual.description.trim(), paymentChannel: manual.paymentChannel, visibility: manual.visibility };
      const updated = await entry.client.updateTransaction(transaction.id, patch);
      entry.setSaved(updated); entry.beginEdit(updated); setSaved(true);
      void query.invalidateQueries({ queryKey: ['history'] });
    } catch (caught) {
      if (caught instanceof ValidationError) setErrors(caught.fields);
      if (caught instanceof ApiError && caught.outcome === 'unknown') setUnknown(true);
      setError(caught instanceof Error ? caught.message : 'The update could not be saved.');
    }
  }); };
  const reload = () => { void entry.runExclusive(async () => {
    try {
      const fresh = await entry.client.request<Transaction>(`/api/transactions/${encodeURIComponent(transaction.id)}`);
      entry.beginEdit(fresh); baseline.current = JSON.stringify({
        ...entry.edit!.manual, amount: String(fresh.amount), date: fresh.transactionDate.slice(0, 10),
        accountId: fresh.accountId ?? null, categoryId: fresh.categoryId ?? null,
        merchant: fresh.merchantName ?? '', description: fresh.description ?? '',
        paymentChannel: fresh.paymentChannel ?? 'Unknown', visibility: fresh.visibility,
      }); setUnknown(false); setError(null);
    } catch { setError('The saved transaction could not be reloaded yet.'); }
  }); };
  return <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {saved ? <><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.heading}>Changes saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></> : <>
        <Text style={styles.caption}>Editing the existing saved record.</Text>
        <ManualForm draft={manual} resources={entry.resources} disabled={entry.busy || unknown} errors={errors} editing
          onChange={change => entry.updateManual(change, 'edit')} onSelect={kind => navigation.navigate('Picker', { kind, target: 'edit' })} />
        <Button title={unknown ? 'Reload saved transaction' : 'Save changes'} onPress={unknown ? reload : submit} loading={entry.busy} />
      </>}
      {error ? <ErrorNotice message={error} /> : null}
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
