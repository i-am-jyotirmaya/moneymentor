import { useState } from 'react';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@spndrr/finance-core';
import { useWorkspace } from '../state/workspace';
import { Button, Card, ErrorNotice, styles } from '../ui/primitives';
import { Page } from '../ui/forms';
import { CategoryChart, FinancialSkeleton, MetricTile } from '../ui/finance';
import { MonthControl, ScopeLabel } from '../ui/workspace';
import { TransactionRow } from './Home';
import type { FeatureNavigationProps } from '../navigation';

export function DashboardScreen({ navigation }: FeatureNavigationProps) {
  const { api, scope, today } = useWorkspace(); const [month, setMonth] = useState(today.slice(0, 7));
  const data = useQuery({ queryKey: ['dashboard', scope, month], queryFn: () => api.dashboard(month, scope), staleTime: 30000 });
  const summary = data.data;
  return <Page title="A clearer picture" onRefresh={() => { void data.refetch(); }} refreshing={data.isRefetching}>
    <ScopeLabel /><MonthControl value={month} onChange={setMonth} />
    {data.isError ? <ErrorNotice message="Your financial summary could not be refreshed." onRetry={() => { void data.refetch(); }} /> : null}
    {data.isPending ? <FinancialSkeleton /> : summary ? <>
      <MetricTile label="Income" amount={summary.income} currency={summary.currencyCode} />
      <MetricTile label="Spending" amount={summary.spends} currency={summary.currencyCode} />
      <MetricTile label="Invested" amount={summary.invested} currency={summary.currencyCode} />
      <MetricTile label="Saved" amount={summary.saved} currency={summary.currencyCode} detail={summary.savingsRate === null ? 'Not enough income data for a savings rate.' : `Savings rate: ${summary.savingsRate}%`} />
      <CategoryChart categories={summary.categories} currency={summary.currencyCode} />
      {summary.judgements.map((item, index) => <Card key={item.id ?? `${item.title}-${index}`}><Text style={styles.heading}>{item.title}</Text><Text style={styles.caption}>{item.tone} · {item.value}</Text><Text style={styles.body}>{item.text}</Text></Card>)}
      {summary.insights.map((item, index) => <Card key={`${item.title}-${index}`}><Text style={styles.heading}>{item.title}</Text><Text style={styles.body}>{item.text}</Text></Card>)}
      <Text accessibilityRole="header" style={styles.heading}>Recent activity</Text>
      {summary.recentTransactions.map(item => <TransactionRow key={item.id} transaction={item} onPress={() => navigation.navigate('Transaction', { id: item.id })} />)}
      {!summary.recentTransactions.length ? <Text style={styles.caption}>No transactions in this period.</Text> : null}
      <Text style={styles.caption}>Amounts and budgets come from your tracked data. Net refunds may make a category negative. {formatMoney(summary.saved, summary.currencyCode)} saved for this period.</Text>
    </> : null}
    <Button title="Browse transactions" secondary onPress={() => navigation.navigate('Transactions')} />
  </Page>;
}
