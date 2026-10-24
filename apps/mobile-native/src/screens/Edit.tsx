import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, buildTransactionIntent, ValidationError, type Transaction, type TransactionPatch } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { OperationNotice, useOperations } from '../state/operations';
import { Button, ErrorNotice, useStyles } from '../ui/primitives';
import { TransactionEditForm } from '../ui/TransactionEditForm';
import type { ScreenProps } from '../navigation';

export function EditScreen({ navigation }: ScreenProps<'Edit'>) {
  const styles = useStyles();

  const entry = useEntry();
  const operations = useOperations();
  const query = useQueryClient();
  const blocked = operations.blocked || !!entry.draft.pendingManual || entry.draft.assistantUncertain || !entry.resources.canWrite;
  const headerHeight = useHeaderHeight();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unknown, setUnknown] = useState(false);
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(() => JSON.stringify(entry.edit?.manual));
  const dirty = JSON.stringify(entry.edit?.manual) !== baseline;
  usePreventRemove((dirty || unknown) && !saved, ({ data }) => {
    Alert.alert(unknown ? 'Update not confirmed' : 'Keep your changes?', unknown ? 'The update may already be saved. Reload the transaction before making another change.' : 'Your unsaved edits will be discarded.',
      [{ text: 'Keep editing', style: 'cancel' }, { text: 'Close editor', style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  if (!entry.edit) return <SafeAreaView style={styles.screen}><ErrorNotice message="Open a transaction from recent history to edit it." /></SafeAreaView>;
  const { transaction, manual } = entry.edit;
  const submit = () => { void entry.runExclusive(async () => {
    if (blocked) return;
    setError(null); setErrors({});
    try {
      const intent = buildTransactionIntent(manual, entry.resources, 'native:validate-edit');
      const patch: TransactionPatch = { amount: intent.amount, transactionDate: intent.date, categoryId: intent.categoryId, accountId: intent.accountId,
        merchantName: manual.merchant.trim(), description: manual.description.trim(), paymentChannel: manual.paymentChannel, visibility: manual.visibility };
      const updated = await operations.guard.run('Update transaction', () => entry.client.updateTransaction(transaction.id, patch), entry.resources.householdId);
      entry.setSaved(updated); entry.beginEdit(updated); setSaved(true);
      void query.invalidateQueries();
    } catch (caught) {
      if (caught instanceof ValidationError) setErrors(caught.fields);
      if (caught instanceof ApiError && caught.outcome === 'unknown') setUnknown(true);
      setError(caught instanceof Error ? caught.message : 'The update could not be saved.');
    }
  }); };
  const reload = () => { void entry.runExclusive(async () => {
    try {
      const fresh = await entry.client.request<Transaction>(`/api/transactions/${encodeURIComponent(transaction.id)}`);
      entry.beginEdit(fresh); setBaseline(JSON.stringify({
        ...entry.edit!.manual, amount: String(fresh.amount), date: fresh.transactionDate.slice(0, 10),
        accountId: fresh.accountId ?? null, categoryId: fresh.categoryId ?? null,
        merchant: fresh.merchantName ?? '', description: fresh.description ?? '',
        paymentChannel: fresh.paymentChannel ?? 'Unknown', visibility: fresh.visibility,
      })); setUnknown(false); setError(null);
    } catch { setError('The saved transaction could not be reloaded yet.'); }
  }); };
  return <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <OperationNotice refresh={() => query.refetchQueries({ type: 'active' }, { throwOnError: true })} />
      {saved ? <><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.heading}>Changes saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></> : <>
        <Text style={styles.caption}>Editing the existing saved record.</Text>
        {entry.draft.pendingManual || entry.draft.assistantUncertain ? <Button title="Review pending transaction" secondary onPress={() => navigation.navigate('Composer')} /> : null}
        <TransactionEditForm draft={manual} resources={entry.resources} disabled={entry.busy || unknown || blocked} errors={errors}
          onChange={change => entry.updateManual(change, 'edit')} onSelect={kind => navigation.navigate('Picker', { kind, target: 'edit' })} />
        <Button title={unknown ? 'Reload saved transaction' : 'Save changes'} onPress={unknown ? reload : submit} loading={entry.busy} disabled={!unknown && blocked} />
      </>}
      {error ? <ErrorNotice message={error} /> : null}
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
