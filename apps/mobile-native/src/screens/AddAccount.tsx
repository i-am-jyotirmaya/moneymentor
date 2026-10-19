import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, type FinancialAccount } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { Button, ErrorNotice, Field, styles } from '../ui/primitives';
import type { ScreenProps } from '../navigation';

export function AddAccountScreen({ navigation }: ScreenProps<'AddAccount'>) {
  const entry = useEntry();
  const query = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialAccount['accountType']>('BankAccount');
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const save = () => { void entry.runExclusive(async () => {
    if (!name.trim()) { setError('Give this account a name.'); return; }
    setError(null);
    try {
      const account = await entry.client.createAccount(name, type);
      await query.invalidateQueries({ queryKey: ['entry'] });
      entry.updateManual({ accountId: account.id }); navigation.goBack();
    } catch (caught) {
      if (caught instanceof ApiError && caught.outcome === 'unknown') setUnknown(true);
      setError(caught instanceof Error ? caught.message : 'Could not add the account.');
    }
  }); };
  return <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Name it how you use it.</Text>
      <Text style={styles.caption}>A credit card and bank account can have different names, such as Kotak upi and Kotak.</Text>
      <Field label="Account name" value={name} onChangeText={setName} maxLength={128} editable={!entry.busy && !unknown} />
      <View style={styles.row}>{(['BankAccount', 'CreditCard', 'Cash', 'Wallet'] as const).map(value =>
        <Button key={value} title={value === 'CreditCard' ? 'Credit card' : value === 'BankAccount' ? 'Bank account' : value} secondary={value !== type} selected={value === type} disabled={entry.busy || unknown} onPress={() => setType(value)} />)}</View>
      <Button title="Add account" onPress={save} loading={entry.busy} disabled={unknown || !name.trim()} />
      {unknown ? <Text accessibilityRole="alert" style={styles.body}>This account may already exist. Return to the account list and refresh before creating another.</Text> : null}
      {error ? <ErrorNotice message={error} /> : null}
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
