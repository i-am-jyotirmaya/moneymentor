import { useState } from 'react';
import { FlatList, Keyboard, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { categoryOptions, type ManualDraft, type PaymentChannel, type Visibility } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { Button, ErrorNotice, Field, styles } from '../ui/primitives';
import { color } from '../ui/theme';
import type { ScreenProps } from '../navigation';

export function PickerScreen({ route, navigation }: ScreenProps<'Picker'>) {
  const entry = useEntry();
  const query = useQueryClient();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { kind, target = 'manual' } = route.params;
  const draft = target === 'edit' ? entry.edit?.manual ?? entry.draft.manual : entry.draft.manual;
  const term = search.trim().toLocaleLowerCase();
  const options = kind === 'category'
    ? categoryOptions(entry.resources.categories, draft.eventKind === 'Income' ? 'Income' : 'Expense', search).map(c => ({ id: c.id, label: c.label, detail: c.category.classification }))
    : kind === 'account' ? entry.resources.accounts.filter(a => a.isActive && a.householdId === entry.resources.householdId && a.currencyCode === entry.resources.settings.currencyCode)
      .map(a => ({ id: a.id, label: a.name, detail: `${a.accountType === 'CreditCard' ? 'Credit card' : a.accountType === 'BankAccount' ? 'Bank account' : a.accountType}${a.last4 ? ` · ${a.last4}` : ''}` }))
    : kind === 'payment' ? ['Unknown', 'UPI', 'Card', 'Cash', 'BankTransfer', 'AutoDebit', 'Wallet', 'Cheque'].map(id => ({ id, label: id === 'Unknown' ? 'Not specified' : id, detail: '' }))
    : [{ id: 'Private', label: 'Only me', detail: 'Private transaction' }, { id: 'Household', label: 'Household members', detail: 'Visible to active household members' }];
  const selected = kind === 'category' ? draft.categoryId : kind === 'account' ? draft.accountId : kind === 'payment' ? draft.paymentChannel : draft.visibility;
  const refresh = () => { void entry.runExclusive(async () => {
    setError(null);
    try { await query.invalidateQueries({ queryKey: ['entry'] }, { throwOnError: true }); }
    catch { setError('Your accounts could not be refreshed. Check your connection and try again.'); }
  }); };
  const choose = (id: string) => {
    const change: Partial<ManualDraft> = kind === 'category' ? { categoryId: id } : kind === 'account' ? { accountId: id } : kind === 'payment' ? { paymentChannel: id as PaymentChannel } : { visibility: id as Visibility };
    entry.updateManual(change, target); Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    navigation.goBack();
  };
  return <SafeAreaView style={styles.screen} edges={['bottom']}>
    <FlatList data={options.filter(o => `${o.label} ${o.detail}`.toLocaleLowerCase().includes(term))} keyExtractor={item => item.id}
      contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      ListHeaderComponent={<View style={{ gap: 14 }}><Text accessibilityRole="header" style={styles.heading}>{kind === 'category' ? 'Find your category' : kind === 'account' ? 'Choose the exact account' : 'Choose an option'}</Text>
        <Field label={`Search ${kind}`} value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" placeholder="Search…" />
        {kind === 'account' ? <Button title="Refresh accounts" secondary loading={entry.busy} onPress={refresh} /> : null}
        {error ? <ErrorNotice message={error} /> : null}
        {kind === 'account' && target === 'manual' ? <Button title="Add an account" secondary onPress={() => navigation.navigate('AddAccount')} /> : null}</View>}
      ListEmptyComponent={<Text style={styles.caption}>No matching options. Try a different search.</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected === item.id, disabled: entry.busy }} accessibilityLabel={`${item.label}${item.detail ? `, ${item.detail}` : ''}`}
        disabled={entry.busy} onPress={() => choose(item.id)} style={{ minHeight: 68, padding: 18, borderRadius: 18, backgroundColor: selected === item.id ? color.tint : color.surface, borderWidth: 1, borderColor: color.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={styles.body}>{item.label}</Text>{item.detail ? <Text style={styles.caption}>{item.detail}</Text> : null}</View>
        {selected === item.id ? <Text accessible={false} style={styles.body}>✓</Text> : null}
      </Pressable>} />
  </SafeAreaView>;
}
