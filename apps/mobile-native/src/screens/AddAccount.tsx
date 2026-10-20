import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useHeaderHeight } from '@react-navigation/elements';
import type { FinancialAccount } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { OperationNotice, useOperations } from '../state/operations';
import { useWorkspace } from '../state/workspace';
import { Button, ErrorNotice, Field, styles } from '../ui/primitives';
import type { ScreenProps } from '../navigation';

export function AddAccountScreen({ navigation }: ScreenProps<'AddAccount'>) {
  const entry = useEntry();
  const { api, scope } = useWorkspace();
  const query = useQueryClient();
  const headerHeight = useHeaderHeight();
  const operations = useOperations();
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialAccount['accountType']>('BankAccount');
  const [error, setError] = useState<string | null>(null);
  const save = () => { void entry.runExclusive(async () => {
    if (operations.blocked) return;
    if (!name.trim()) { setError('Give this account a name.'); return; }
    setError(null);
    try {
      const account = await operations.guard.run('Add financial account', () => api.saveAccount({ householdId: scope, name: name.trim(), accountType: type, institution: null, last4: null, aliases: [], shared: false, isActive: true }));
      await query.invalidateQueries({ queryKey: ['entry'] });
      entry.updateManual({ accountId: account.id }); navigation.goBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the account.');
    }
  }); };
  return <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Name it how you use it.</Text>
      <Text style={styles.caption}>A credit card and bank account can have different names, such as Kotak upi and Kotak.</Text>
      <OperationNotice refresh={() => query.invalidateQueries({ queryKey: ['entry'] }, { throwOnError: true })} />
      <Field label="Account name" value={name} onChangeText={setName} maxLength={128} editable={!entry.busy && !operations.blocked} />
      <View style={styles.row}>{(['BankAccount', 'CreditCard', 'Cash', 'Wallet'] as const).map(value =>
        <Button key={value} title={value === 'CreditCard' ? 'Credit card' : value === 'BankAccount' ? 'Bank account' : value} secondary={value !== type} selected={value === type} disabled={entry.busy || operations.blocked} onPress={() => setType(value)} />)}</View>
      <Button title="Add account" onPress={save} loading={entry.busy} disabled={operations.blocked || !name.trim()} />
      {error ? <ErrorNotice message={error} /> : null}
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
