import { useMemo, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { formatMoney } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, styles } from '../ui/primitives';
import { ChoiceField, Page } from '../ui/forms';
import { choices, EmptyState, MonthControl, ScopeLabel } from '../ui/workspace';
import { TransactionRow } from './Home';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

export function TransactionsScreen({ navigation }: FeatureNavigationProps) {
  const entry = useEntry(); const { api, scope, today } = useWorkspace();
  const [month, setMonth] = useState(today.slice(0, 7)); const [search, setSearch] = useState('');
  const [trash, setTrash] = useState(false); const [account, setAccount] = useState('all'); const [kind, setKind] = useState('all'); const [category, setCategory] = useState('all');
  const history = useInfiniteQuery({ queryKey: ['history', entry.draft.ownerId, scope, month], initialPageParam: 1,
    queryFn: ({ pageParam }) => entry.client.transactions(month, pageParam, scope),
    getNextPageParam: last => last.page < last.totalPages ? last.page + 1 : undefined, enabled: !trash, staleTime: 30000 });
  const deleted = useQuery({ queryKey: ['trash', scope], queryFn: () => api.trash(scope), enabled: trash });
  const items = useMemo(() => (trash ? deleted.data?.items ?? [] : history.data?.pages.flatMap(page => page.items) ?? []).filter(item =>
    (account === 'all' || item.accountId === account || item.counterpartyAccountId === account)
    && (category === 'all' || item.categoryId === category)
    && (kind === 'all' || (item.kind ?? item.type) === kind)
    && `${item.description ?? ''} ${item.categoryName ?? ''} ${item.accountName ?? ''} ${item.merchantName ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())),
  [trash, deleted.data, history.data, search, account, category, kind]);
  const current = trash ? deleted : history;
  return <SafeAreaView style={styles.screen} edges={['bottom']}><FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.content}
    initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
    refreshing={current.isRefetching} onRefresh={() => { void current.refetch(); }}
    onEndReached={() => { if (!trash && history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage(); }}
    ListHeaderComponent={<View style={{ gap: 18 }}><Text style={styles.title}>{trash ? 'Recently deleted' : 'Your transactions'}</Text><ScopeLabel />
      <View style={styles.row}><Button title="History" secondary={trash} selected={!trash} onPress={() => setTrash(false)} /><Button title="Trash" secondary={!trash} selected={trash} onPress={() => setTrash(true)} /></View>
      {!trash ? <MonthControl value={month} onChange={setMonth} /> : <Text style={styles.caption}>Restore an item to return it to your history and totals.</Text>}
      <Field label="Search loaded transactions" value={search} onChangeText={setSearch} placeholder="Note, merchant, category, account…" />
      <ChoiceField label="Account filter" value={account} options={[{ id: 'all', label: 'All accounts' }, ...entry.resources.accounts.map(item => ({ id: item.id, label: item.name, detail: item.accountType }))]} onChange={setAccount} />
      <ChoiceField label="Category filter" value={category} options={[{ id: 'all', label: 'All categories' }, ...entry.resources.categories.map(item => ({ id: item.id, label: item.name }))]} onChange={setCategory} />
      <ChoiceField label="Event filter" value={kind} options={[{ id: 'all', label: 'All events' }, ...choices(['Purchase', 'Income', 'Refund', 'Transfer', 'CreditCardPayment', 'Reversal', 'Cashback', 'Fee', 'Interest', 'CashWithdrawal', 'Investment'])]} onChange={setKind} />
      {!trash ? <Text style={styles.caption}>{history.data?.pages[0]?.totalCount ?? 0} records this month. Search and filters apply to loaded pages; load more to include older records.</Text> : null}
      <Button title="Add transfer or adjustment" secondary disabled={!entry.resources.canWrite} onPress={() => navigation.navigate('FinancialEvent')} />
      {current.isError ? <ErrorNotice message="Transactions could not be loaded." onRetry={() => { void current.refetch(); }} /> : null}
    </View>}
    ListEmptyComponent={current.isPending ? <Loading /> : current.isError ? null : <EmptyState title="No matching transactions" detail="Try another period or clear a filter." />}
    ListFooterComponent={!trash && history.hasNextPage ? <Button title="Load more transactions" secondary loading={history.isFetchingNextPage} onPress={() => { void history.fetchNextPage(); }} /> : null}
    renderItem={({ item }) => <TransactionRow transaction={item} onPress={() => navigation.navigate('Transaction', { id: item.id })} />} />
  </SafeAreaView>;
}

export function TransactionScreen({ navigation, route }: ScreenProps<'Transaction'>) {
  const entry = useEntry(); const { api, scope } = useWorkspace(); const mutation = useWorkspaceMutation();
  const detail = useQuery({ queryKey: ['transaction', scope, route.params.id], queryFn: async () => {
    const item = await api.transaction(route.params.id); if (item.householdId !== scope) throw Error('This record belongs to another household.'); return item;
  } });
  const item = detail.data;
  const remove = () => { if (!item) return; Alert.alert('Move transaction to trash?', 'Your totals will be recalculated. Related event rules are checked by Spndrr.', [
    { text: 'Keep transaction', style: 'cancel' }, { text: 'Move to trash', style: 'destructive', onPress: () => { void mutation.execute('Move transaction to trash', () => api.deleteTransaction(item.id)); } },
  ]); };
  return <Page title="Transaction details" error={mutation.error} onRefresh={() => { void detail.refetch(); }} refreshing={detail.isRefetching}>
    <OperationNotice refresh={mutation.refresh} />
    {detail.isPending ? <Loading /> : detail.isError ? <ErrorNotice message="The transaction could not be loaded in this household." onRetry={() => { void detail.refetch(); }} /> : item ? <>
      <Card><Text style={styles.title}>{formatMoney(item.amount, item.currencyCode)}</Text><Text style={styles.heading}>{item.kind ?? item.type}</Text>
        <Text style={styles.body}>{item.description || item.merchantName || item.categoryName || 'Financial event'}</Text>
        <Text style={styles.caption}>{item.transactionDate.slice(0, 10)} · {item.visibility}{item.deletedAt ? ' · In trash' : ''}</Text>
        <Text style={styles.body}>Account: {item.accountName ?? 'Not specified'}</Text>
        {item.counterpartyAccountName ? <Text style={styles.body}>Destination: {item.counterpartyAccountName}</Text> : null}
        {item.categoryName ? <Text style={styles.body}>Category: {item.parentCategoryName ? `${item.parentCategoryName} / ` : ''}{item.categoryName}</Text> : null}
        {item.merchantName ? <Text style={styles.body}>Merchant: {item.merchantName}</Text> : null}
        {item.paymentChannel ? <Text style={styles.caption}>Payment: {item.paymentChannel}</Text> : null}
        {item.financialImpact ? <Text style={styles.caption}>Spending impact: {formatMoney(item.financialImpact.spending, item.currencyCode)} · Income impact: {formatMoney(item.financialImpact.income, item.currencyCode)} · Investment impact: {formatMoney(item.financialImpact.investment, item.currencyCode)}</Text> : null}
      </Card>
      {item.relatedTransactionId ? <Button title="View original event" secondary onPress={() => navigation.push('Transaction', { id: item.relatedTransactionId! })} /> : null}
      {item.deletedAt ? <Button title="Restore transaction" disabled={mutation.blocked} loading={mutation.busy} onPress={() => { void mutation.execute('Restore transaction', () => api.restoreTransaction(item.id)); }} /> : <>
        {(!item.kind || ['Purchase', 'Income'].includes(item.kind)) && ['Expense', 'Income'].includes(item.type) ? <Button title="Edit transaction" disabled={mutation.blocked} onPress={() => { entry.beginEdit(item); navigation.navigate('Edit'); }} /> : null}
        {['Purchase', 'Fee', 'Interest'].includes(item.kind ?? (item.type === 'Expense' ? 'Purchase' : '')) ? <Button title="Add linked refund" secondary disabled={mutation.blocked} onPress={() => navigation.navigate('FinancialEvent', { originalId: item.id, kind: 'Refund' })} /> : null}
        {item.kind !== 'Reversal' ? <Button title="Reverse this event" secondary disabled={mutation.blocked} onPress={() => navigation.navigate('FinancialEvent', { originalId: item.id, kind: 'Reversal' })} /> : null}
        <Button title="Move to trash" secondary disabled={mutation.blocked} onPress={remove} />
      </>}
    </> : null}
  </Page>;
}
