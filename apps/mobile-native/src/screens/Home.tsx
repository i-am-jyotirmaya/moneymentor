import { memo, useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, type Transaction } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { OperationNotice, useOperations } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, styles } from '../ui/primitives';
import { color } from '../ui/theme';
import type { FeatureNavigationProps } from '../navigation';
import { clearExportCache } from '../services/share-export';

export const TransactionRow = memo(function TransactionRow({ transaction, onPress }: { transaction: Transaction; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress}
    accessibilityLabel={`${transaction.description ?? transaction.merchantName ?? transaction.categoryName ?? transaction.kind}, ${formatMoney(transaction.amount, transaction.currencyCode)}, ${transaction.kind ?? transaction.type}, ${transaction.accountName ?? 'No account'}`}
    style={{ minHeight: 82, backgroundColor: color.surface, borderRadius: 20, padding: 18, gap: 8, borderWidth: 1, borderColor: color.border }}>
    <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
      <Text style={[styles.body, { fontWeight: '600', flex: 1 }]}>{transaction.description || transaction.merchantName || transaction.categoryName || transaction.kind}</Text>
      <Text style={[styles.body, { fontWeight: '600' }]}>{formatMoney(transaction.amount, transaction.currencyCode)}</Text>
    </View>
    <Text style={styles.caption}>{transaction.kind ?? transaction.type} · {transaction.accountName ?? 'No account specified'} · {transaction.transactionDate.slice(0, 10)}</Text>
  </Pressable>;
});
function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year ?? 2026, (number ?? 1) - 1 + delta, 1)).toISOString().slice(0, 7);
}
export function HomeScreen({ navigation }: FeatureNavigationProps) {
  const entry = useEntry();
  const operations = useOperations(); const query = useQueryClient();
  const [month, setMonth] = useState(entry.resources.today.slice(0, 7));
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const history = useInfiniteQuery({
    queryKey: ['history', entry.draft.ownerId, entry.resources.householdId, month], initialPageParam: 1,
    queryFn: ({ pageParam }) => entry.client.transactions(month, pageParam, entry.resources.householdId),
    getNextPageParam: last => last.page < last.totalPages ? last.page + 1 : undefined,
    retry: 1, staleTime: 30000,
  });
  const { refetch } = history;
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));
  const items = useMemo(() => history.data?.pages.flatMap(page => page.items).filter(t =>
    `${t.description ?? ''} ${t.categoryName ?? ''} ${t.accountName ?? ''} ${t.merchantName ?? ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [], [history.data, search]);
  const signout = () => {
    if (operations.busy) return;
    const execute = () => { void entry.runExclusive(async () => {
      try { clearExportCache(); await entry.clearForLogout(); }
      finally { await entry.client.logout().catch(() => { setError('The device is signed out. Server session revocation could not be confirmed.'); }); }
    }); };
    if (entry.draft.text || entry.draft.manual.amount || entry.draft.pendingManual || entry.draft.assistantUncertain || operations.pending) Alert.alert('Sign out and clear draft?', 'This removes the unsent transaction draft. A pending change may already be saved; check saved data first. Any pending-change safety marker is retained for review when you sign in again.', [
      { text: 'Keep working', style: 'cancel' }, { text: 'Sign out and clear draft', style: 'destructive', onPress: execute },
    ]);
    else execute();
  };
  return <SafeAreaView style={styles.screen}>
    <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.content}
      initialNumToRender={12} windowSize={7} maxToRenderPerBatch={12}
      refreshing={history.isRefetching && !history.isFetchingNextPage} onRefresh={() => { void history.refetch(); }}
      onEndReached={() => { if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage(); }} onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      ListHeaderComponent={<View style={{ gap: 22 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}><Text accessibilityRole="header" style={styles.heading}>spndrr<Text style={{ color: color.muted }}>.</Text></Text>
          <Button title="Sign out" onPress={signout} disabled={entry.busy || operations.busy} secondary /></View>
        <View style={{ gap: 8 }}><Text style={styles.caption}>A little clarity, every day.</Text><Text style={styles.title}>{'Your money.\nA calmer mind.'}</Text></View>
        <Card dark><Text style={[styles.heading, { color: color.surface }]}>What happened today?</Text>
          <Text style={[styles.body, { color: '#dbe7d5' }]}>Tell Spndrr about a transaction, or enter the details yourself.</Text>
          <Button title={entry.draft.pendingManual || entry.draft.assistantUncertain ? 'Review pending transaction' : entry.draft.text || entry.draft.manual.amount ? 'Continue your draft' : 'Add a transaction'}
            testID="open-composer"
            onPress={() => { entry.setSaved(null); navigation.navigate('Composer'); }} disabled={!entry.resources.canWrite || (entry.saved !== null && entry.persistenceError !== null)} secondary />
        </Card>
        <OperationNotice refresh={() => Promise.all([query.invalidateQueries({ queryKey: ['entry'] }, { throwOnError: true }), history.refetch({ throwOnError: true })])} />
        {entry.saved ? <Text accessibilityLiveRegion="polite" style={styles.caption}>Last saved: {formatMoney(entry.saved.amount, entry.saved.currencyCode)} · {entry.saved.accountName ?? entry.saved.kind}</Text> : null}
        {entry.saved && entry.persistenceError ? <ErrorNotice message="The transaction is saved. Its local draft still needs clearing." onRetry={() => { void entry.complete(entry.saved!); }} /> : null}
        <View style={[styles.row, { justifyContent: 'space-between' }]}><Text accessibilityRole="header" style={styles.heading}>Recent transactions</Text>
          <View style={styles.row}><Button title="‹" accessibilityLabel="Previous month" secondary onPress={() => setMonth(previous => shiftMonth(previous, -1))} />
            <Button title="›" accessibilityLabel="Next month" secondary disabled={month >= entry.resources.today.slice(0, 7)} onPress={() => setMonth(previous => shiftMonth(previous, 1))} /></View></View>
        <Text style={styles.caption}>{month} · Pull down to refresh</Text>
        <Field label="Search loaded transactions" value={search} onChangeText={setSearch} placeholder="Description, category, account…" />
        <Button title="Filters, transfers and trash" secondary onPress={() => navigation.navigate('Transactions')} />
        {history.isError ? <ErrorNotice message="Recent transactions could not be refreshed. Pull down or try again." onRetry={() => { void history.refetch(); }} /> : null}
        {error ? <ErrorNotice message={error} /> : null}
      </View>}
      ListEmptyComponent={history.isPending ? <Loading label="Loading recent transactions…" /> : history.isError ? null : <Card><Text style={styles.body}>{search ? 'No match in loaded transactions.' : 'A fresh page for this month.'}</Text><Text style={styles.caption}>{search ? 'Scroll or load another page to search more records.' : 'Add a transaction to start making sense of your spending.'}</Text></Card>}
      ListFooterComponent={history.hasNextPage ? <Button title="Load more transactions" secondary loading={history.isFetchingNextPage} onPress={() => { void history.fetchNextPage(); }} /> : null}
      renderItem={({ item }) => <TransactionRow transaction={item} onPress={(!item.kind || ['Purchase', 'Income'].includes(item.kind)) && ['Expense', 'Income'].includes(item.type)
        ? () => { entry.beginEdit(item); navigation.navigate('Edit'); } : undefined} />} />
  </SafeAreaView>;
}
