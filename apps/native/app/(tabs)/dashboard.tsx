import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate, formatMoney, formatMonthKey, formatTone, getCurrentMonthKey, getMonthOptions, shiftMonthKey } from '../../src/lib/format';
import { colors, styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { categoryPercent, transactionPresentation } from '../../src/workspace/dashboard-data';
import { Action, Choice, Loading, Panel, ws } from '../../src/workspace/ui';

export default function Dashboard() {
  const { dashboard: data, month, setMonth, loading } = useWorkspace();
  const router = useRouter();
  if (!data) return <View testID="dashboard-screen" style={ws.fill}>{loading ? <Loading /> : null}</View>;
  const money = (value: number) => formatMoney(value, data.currencyCode);
  return <ScrollView testID="dashboard-screen" accessibilityState={{ busy: loading }} contentContainerStyle={ws.content}>
    <View><Text style={styles.text}>{data.monthLabel}</Text><Text style={[styles.title, { fontSize: 30 }]}>Dashboard</Text><Text style={styles.text}>Your income, spending, and progress at a glance.</Text></View>
    <View style={ws.row}><Action title="‹" label="Previous dashboard month" disabled={loading} onPress={() => setMonth(shiftMonthKey(month, -1))} /><Choice label="Dashboard month" value={month} disabled={loading} options={getMonthOptions(month).map(value => ({ value, label: formatMonthKey(value) }))} onChange={setMonth} /><Action title="›" label="Next dashboard month" disabled={loading || shiftMonthKey(month, 1) > getCurrentMonthKey()} onPress={() => setMonth(shiftMonthKey(month, 1))} /></View>
    <View style={ws.row}><Action title="Track a transaction" onPress={() => router.navigate('/(tabs)/assistant')} /><Action title="Review judgments" onPress={() => router.navigate('/(tabs)/reports')} /><Action title="Plan a goal" onPress={() => router.navigate('/(tabs)/planning')} /></View>
    {[
      ['Income', money(data.income), 'Tracked income'],
      ['Spends', money(data.spends), 'Tracked expenses'],
      ['Saved', money(data.saved), data.savingsRate === null ? 'Income not tracked' : `${data.savingsRate}% savings rate`],
      ['Categories', data.categories.length.toString(), 'Spending categories'],
    ].map(([label, value, detail]) => <Panel title={label} key={label}><Text style={styles.title}>{value}</Text><Text style={styles.text}>{detail}</Text></Panel>)}
    <Panel title="Category spending"><Text style={styles.text}>Calculated from stored expenses.</Text>{data.categories.length ? data.categories.map((category, index) => {
      const percent = categoryPercent(category.amount, data.spends);
      return <View style={ws.item} key={`${category.name}-${index}`}><View style={ws.row}><Text style={styles.label}>{category.name}</Text><Text style={styles.label}>{money(category.amount)}</Text></View><Text style={ws.small}>{category.note}</Text><Text style={ws.small}>{percent}%</Text><View style={{ height: 8, backgroundColor: 'white', borderRadius: 8 }}><View style={{ height: 8, width: `${Math.min(percent, 100)}%`, backgroundColor: colors.accent, borderRadius: 8 }} /></View></View>;
    }) : <Text style={styles.text}>No expenses are tracked for this month yet.</Text>}</Panel>
    <Panel title="Judgements">{data.judgements.map((judgement, index) => <View style={ws.item} key={index}><View style={ws.row}><Text style={{ color: judgement.tone === 'Healthy' ? '#047857' : judgement.tone === 'Watch' ? '#B45309' : '#BE123C', fontWeight: '700' }}>{formatTone(judgement.tone)}</Text><Text style={styles.label}>{judgement.value}</Text></View><Text style={styles.label}>{judgement.title}</Text><Text style={styles.text}>{judgement.text}</Text></View>)}</Panel>
    <Panel title="Insights">{data.insights.map((insight, index) => <View style={ws.item} key={index}><Text style={styles.label}>{insight.title}</Text><Text style={styles.text}>{insight.text}</Text></View>)}</Panel>
    <Panel title="Recent transactions"><Text style={styles.text}>Your latest expenses and income.</Text>{data.recentTransactions.length ? data.recentTransactions.map(transaction => {
      const display = transactionPresentation(transaction);
      return <View key={transaction.id} style={ws.item}><Text style={styles.label}>{display.label}</Text><Text style={ws.small}>{formatTone(transaction.kind ?? transaction.type)}</Text><Text style={ws.small}>{transaction.categoryName ?? 'Uncategorized'}{display.income && transaction.senderName ? ` - From ${transaction.senderName}` : ''}{!display.income && transaction.merchantName ? ` - ${transaction.merchantName}` : ''} - {formatDate(transaction.transactionDate)}{transaction.accountName ? ` · ${transaction.accountName}` : ''}{transaction.counterpartyAccountName ? ` → ${transaction.counterpartyAccountName}` : ''}{transaction.relatedTransactionId ? ' · Linked adjustment' : ''}</Text><Text style={[styles.label, display.income && { color: '#047857' }]}>{display.sign}{formatMoney(transaction.amount, transaction.currencyCode)}</Text></View>;
    }) : <Text style={styles.text}>No transactions yet. Try tracking an expense or income in the assistant.</Text>}</Panel>
  </ScrollView>;
}
