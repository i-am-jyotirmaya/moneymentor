import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Goal } from '../../src/api/workspace-models';
import { useSession } from '../../src/auth/session';
import { formatInr, getCurrentMonthKey } from '../../src/lib/format';
import { CashFlowBars, Card, CategoryDonut, categoryIndex, EmptyState, GoalRing, HeroCard, QuickAction, SavingsArea, savingsPoints, donutLegendPlacement, formatPercent, Segmented, SliceGauge, TxRow, useThemedStyles, type DonutSlice } from '../../src/ui';
import { savingsBaseline } from '../../src/ui/charts/chartMath';
import type { ThemeValue } from '../../src/ui/ThemeProvider';
import { useTheme } from '../../src/ui/ThemeProvider';
import { useWorkspace } from '../../src/workspace/context';
import { expenseSlices, goalProgress, goalRingStatus, heroLabel, savingsDelta } from '../../src/workspace/dashboard-data';
import { useDockSpace } from '../../src/workspace/dock';
import { useMonthlyTrend } from '../../src/workspace/monthly-trend';
import { SectionPanel } from '../../src/workspace/sections';

const makeStyles = (t: ThemeValue) => ({
  content: { paddingHorizontal: t.layout.gutter, paddingTop: 8, gap: t.layout.sectionGap },
  actions: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 8 },
  cardHead: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 12, flexWrap: 'wrap' as const },
  title: { ...t.type.title, color: t.color.text },
  subtitle: { ...t.type.caption, color: t.color.text2 },
  link: { ...t.type.label, color: t.color.primaryText },
  linkTarget: { minHeight: 48, minWidth: 48, justifyContent: 'center' as const, alignItems: 'flex-end' as const },
  legend: { flexDirection: 'row' as const, gap: 16, flexWrap: 'wrap' as const },
  legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  donutRow: { flexDirection: 'row' as const, gap: 16, alignItems: 'center' as const, flexWrap: 'wrap' as const },
  rows: { flex: 1, minWidth: 140, gap: 8 },
  donutStack: { flexDirection: 'column' as const, alignItems: 'stretch' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  rowName: { ...t.type.label, color: t.color.text, flex: 1 },
  rowShare: { ...t.type.caption, color: t.color.text2 },
  goal: { width: 188, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  goalName: { ...t.type.label, color: t.color.text },
  section: { ...t.type.title, color: t.color.text },
});

export default function Dashboard() {
  const { dashboard: data, month, loading, section, householdId } = useWorkspace();
  const { client } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const s = useThemedStyles(makeStyles);
  const dock = useDockSpace();
  const [period, setPeriod] = useState<'6M' | '12M'>('6M');
  const trend = useMonthlyTrend(period === '6M' ? 6 : 12);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  useEffect(() => {
    let alive = true;
    if (!householdId) return;
    client.listGoals(householdId).then(list => { if (alive) setGoals(list.filter(g => g.status !== 'Cancelled')); }, () => { if (alive) setGoals(null); });
    return () => { alive = false; };
  }, [client, householdId]);
  if (!data) return <SectionPanel section={section} />;

  const current = getCurrentMonthKey();
  const rate = data.savingsRate;
  const slices = expenseSlices(data.categories);
  const colorFor = (slice: DonutSlice) => slice.id === 'other' ? theme.category[7] : theme.category[categoryIndex(slice.name)];
  const empty = !data.income && !data.spends && data.recentTransactions.length === 0;
  const lastRate = [...trend.months].reverse().find(p => p.savingsRate !== null)?.savingsRate ?? null;
  const go = (path: '/(tabs)/assistant' | '/(tabs)/planning' | '/(tabs)/reports' | '/(tabs)/transactions', params?: Record<string, string>) => router.navigate(params ? { pathname: path, params } : path);

  return <ScrollView testID="dashboard-screen" accessibilityState={{ busy: loading }} contentContainerStyle={[s.content, { paddingBottom: dock + 24 }]}>
    <HeroCard testID="dashboard-hero" label={heroLabel(month, current)} value={data.saved}
      delta={savingsDelta(trend.months, month)}
      a11ySummary={`${heroLabel(month, current)}: net ${formatInr(data.saved, { sign: 'always' })}. In ${formatInr(data.income)}, out ${formatInr(data.spends)}.${rate === null ? '' : ` You kept ${Math.round(rate)} percent of income.`}`}
      pills={[
        { icon: { android: 'south_west', ios: 'arrow.down.left' }, label: 'In', value: formatInr(data.income, { compact: data.income >= 1e7 }) },
        { icon: { android: 'north_east', ios: 'arrow.up.right' }, label: 'Out', value: formatInr(data.spends, { compact: data.spends >= 1e7 }) },
      ]}
      gauge={rate === null ? undefined : <SliceGauge rate={rate} />} />

    <View style={s.actions}>
      <QuickAction testID="quick-add" primary icon={{ android: 'add', ios: 'plus' }} label="Add" onPress={() => go('/(tabs)/assistant', { compose: 'log', at: String(Date.now()) })} />
      <QuickAction testID="quick-ask" icon={{ android: 'forum', ios: 'bubble.left.and.bubble.right' }} label="Ask" onPress={() => go('/(tabs)/assistant', { compose: 'ask', at: String(Date.now()) })} />
      <QuickAction testID="quick-goals" icon={{ android: 'flag', ios: 'flag' }} label="Goals" onPress={() => go('/(tabs)/planning')} />
      <QuickAction testID="quick-judgments" icon={{ android: 'shield_person', ios: 'checkmark.shield' }} label="Judgments" onPress={() => go('/(tabs)/reports')} />
    </View>

    {empty ? <Card><EmptyState icon={{ android: 'receipt_long', ios: 'list.bullet.rectangle' }} title="Nothing logged this month" body="Tell the Assistant what you spent or received, in your own words." action={{ label: 'Log a transaction', onPress: () => go('/(tabs)/assistant', { compose: 'log', at: String(Date.now()) }) }} /></Card> : null}

    <Card testID="dashboard-cash-flow-chart">
      <View style={s.cardHead}>
        <View style={{ flexShrink: 1 }}><Text accessibilityRole="header" style={s.title}>Cash flow</Text><Text style={s.subtitle}>Income vs spending</Text></View>
        <Segmented label="Cash flow period" options={[{ key: '6M', label: '6M' }, { key: '12M', label: '12M' }]} value={period} onChange={setPeriod} />
      </View>
      <View accessible accessibilityLabel={`Cash flow, last ${period === '6M' ? 6 : 12} months. ${trend.months.map(m => `${m.label}: in ${m.income === null ? 'no data' : formatInr(m.income)}, out ${m.spend === null ? 'no data' : formatInr(m.spend)}`).join('. ')}`}>
        <CashFlowBars months={trend.months} selected={month} />
      </View>
      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: theme.color.chartIncome }]} /><Text style={s.subtitle}>Income</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: theme.color.chartSpend }]} /><Text style={s.subtitle}>Spending</Text></View>
      </View>
    </Card>

    <Card testID="dashboard-categories">
      <View style={s.cardHead}>
        <View style={{ flexShrink: 1 }}><Text accessibilityRole="header" style={s.title}>Where it went</Text><Text style={s.subtitle}>Spending by category</Text></View>
        <Pressable style={s.linkTarget} accessibilityRole="link" onPress={() => go('/(tabs)/transactions')}><Text style={s.link}>All</Text></Pressable>
      </View>
      {slices.length ? <View style={[s.donutRow, donutLegendPlacement(theme.fontScale) === 'below' && s.donutStack]} accessible accessibilityLabel={`Spending by category. ${slices.slice(0, 6).map(sl => `${sl.name} ${data.spends > 0 ? Math.round(sl.amount / data.spends * 100) : 0} percent, ${formatInr(sl.amount)}`).join('. ')}`}>
        <CategoryDonut slices={slices} total={data.spends} colorFor={colorFor} size={theme.fontScale >= 1.5 ? 132 : 150} />
        <View style={s.rows}>{slices.slice(0, 5).map(sl => <View key={sl.id} style={s.row}>
          <View style={[s.dot, { backgroundColor: colorFor(sl) }]} />
          <Text numberOfLines={1} style={s.rowName}>{sl.name}</Text>
          <Text style={s.rowShare}>{formatPercent(data.spends > 0 ? sl.amount / data.spends * 100 : 0)}</Text>
        </View>)}</View>
      </View> : <Text style={s.subtitle}>No spending yet this month.</Text>}
    </Card>

    <Card testID="dashboard-savings">
      <View style={s.cardHead}>
        <View style={{ flexShrink: 1 }}><Text accessibilityRole="header" style={s.title}>Savings rate</Text><Text style={s.subtitle}>Share of income kept</Text></View>
        {lastRate !== null ? <Text style={[theme.type.title, { color: theme.color.text, fontFamily: 'InterTight_700Bold' }]}>{formatPercent(lastRate)}</Text> : null}
      </View>
      <View accessible accessibilityLabel={`Savings rate trend. ${trend.months.map(m => `${m.label} ${m.savingsRate === null ? 'no data' : `${Math.round(m.savingsRate)} percent`}`).join(', ')}`}>
        <SavingsArea points={savingsPoints(trend.months.slice(-6))} baseline={savingsBaseline(savingsPoints(trend.months.slice(-6))) ?? undefined} />
      </View>
    </Card>

    {goals && goals.length ? <View style={{ gap: 12 }}>
      <View style={s.cardHead}><Text accessibilityRole="header" style={s.section}>Goals</Text>
        <Pressable style={s.linkTarget} accessibilityRole="link" onPress={() => go('/(tabs)/planning')}><Text style={s.link}>See all</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {goals.slice(0, 3).map(goal => <Card key={goal.id} padding={16}>
          <Pressable style={s.goal} accessibilityRole="button" onPress={() => go('/(tabs)/planning')}
            accessibilityLabel={`${goal.name}, ${Math.round(goalProgress(goal) * 100)} percent, ${formatInr(goal.currentAmount)} of ${formatInr(goal.targetAmount)}`}>
            <GoalRing progress={goalProgress(goal)} status={goalRingStatus(goal)} size={64} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={s.goalName}>{goal.name}</Text>
              <Text style={s.subtitle}>{formatInr(goal.currentAmount, { compact: true })} of {formatInr(goal.targetAmount, { compact: true })}</Text>
            </View>
          </Pressable>
        </Card>)}
      </ScrollView>
    </View> : null}

    <Card testID="dashboard-recent">
      <View style={s.cardHead}><Text accessibilityRole="header" style={s.title}>Recent</Text>
        <Pressable style={s.linkTarget} accessibilityRole="link" onPress={() => go('/(tabs)/transactions')}><Text style={s.link}>All transactions</Text></Pressable></View>
      {data.recentTransactions.length
        ? data.recentTransactions.slice(0, 4).map(tx => <TxRow key={tx.id} tx={tx} testID={`recent-${tx.id}`} onPress={() => go('/(tabs)/transactions')} />)
        : <Text style={s.subtitle}>No transactions yet. Try logging one in the Assistant.</Text>}
    </Card>
  </ScrollView>;
}
