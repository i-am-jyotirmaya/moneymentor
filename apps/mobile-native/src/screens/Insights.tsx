import { useState } from 'react';
import { Text } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { formatMoney, type JudgementReport, type JudgementReportCadence, type JudgementReportObservation, type JudgementReportScope } from '@spndrr/finance-core';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, useStyles } from '../ui/primitives';
import { ChoiceField, Page } from '../ui/forms';
import { choices, EmptyState, MonthControl, ScopeLabel } from '../ui/workspace';

export function InsightsScreen() {
  const styles = useStyles();

  const { api, scope, currency, today } = useWorkspace(); const mutation = useWorkspaceMutation();
  const [cadence, setCadence] = useState<JudgementReportCadence>('Monthly'); const [reportScope, setReportScope] = useState<JudgementReportScope>('Personal');
  const [month, setMonth] = useState(today.slice(0, 7)); const [historyMode, setHistoryMode] = useState(false); const [weeklyPeriod, setWeeklyPeriod] = useState('');
  const [explaining, setExplaining] = useState<string | null>(null); const [explanation, setExplanation] = useState(''); const [message, setMessage] = useState<string | null>(null);
  const input = { householdId: scope, scope: reportScope, cadence };
  const report = useQuery({ queryKey: ['report', scope, reportScope, cadence, month, weeklyPeriod], queryFn: () => api.report({ ...input, ...(cadence === 'Monthly' ? { period: month } : weeklyPeriod ? { period: weeklyPeriod } : {}) }), enabled: !historyMode });
  const active = useQuery({ queryKey: ['active-judgements', scope, reportScope, cadence], queryFn: () => api.activeJudgements(input) });
  const history = useInfiniteQuery({ queryKey: ['report-history', scope, reportScope, cadence], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.reportHistory({ ...input, ...(pageParam ? { before: pageParam } : {}), limit: 10 }), enabled: historyMode,
    getNextPageParam: last => last.length === 10 ? last.at(-1)?.period : undefined });
  const observation = (item: JudgementReportObservation) => <Card key={item.id}>
    <Text style={styles.heading}>{item.title}</Text><Text style={styles.caption}>{item.severity} · {item.direction} · {item.status} · {item.value}</Text><Text style={styles.body}>{item.message}</Text>
    {item.followUpQuestion ? <Text style={styles.body}>{item.followUpQuestion}</Text> : null}
    {!item.isDismissed ? <Button title="Dismiss insight" secondary disabled={mutation.blocked} onPress={() => { void mutation.execute('Dismiss financial insight', () => api.dismissJudgement(item.id)); }} /> : <Text style={styles.caption}>Dismissed</Text>}
    <Button title="Add private context" secondary disabled={mutation.blocked} onPress={() => { setExplaining(item.id); setExplanation(''); setMessage(null); }} />
    {explaining === item.id ? <><Field label="What should Spndrr know?" value={explanation} onChangeText={setExplanation} multiline maxLength={2000} editable={!mutation.blocked} />
      <Text style={styles.caption}>This explanation stays private and is not shared with household members.</Text>
      <Button title="Send private context" disabled={mutation.blocked || !explanation.trim()} onPress={() => { void mutation.execute('Add private insight context', () => api.explainJudgement(item.id, explanation.trim()), () => { setExplaining(null); setExplanation(''); setMessage('Your context was recorded.'); }); }} />
    </> : null}
  </Card>;
  const reportCard = (item: JudgementReport) => <Card key={item.id}>
    <Text style={styles.heading}>{item.period} · {item.direction}</Text><Text style={styles.caption}>{item.scope} · {item.cadence} · {item.confidence} confidence · Revision {item.revision}</Text>
    <Text style={styles.caption}>{item.startDate} to {item.endDateExclusive} (end exclusive) · {item.timeZone}</Text>
    {item.isProcessingUpdate ? <Text accessibilityLiveRegion="polite" style={styles.caption}>An updated report is being calculated.</Text> : null}
    {item.dataQualityFlags.map((flag, index) => <Text key={index} style={styles.caption}>{flag.replace(/([a-z])([A-Z])/g, '$1 $2')}</Text>)}
    {item.narration ? <><Text style={styles.heading}>{item.narration.headline}</Text><Text style={styles.body}>{item.narration.overview}</Text>
      {[...item.narration.whatChanged, ...item.narration.focusAreas, ...item.narration.actions].map((text, index) => <Text key={index} style={styles.body}>{text}</Text>)}</> : <Text style={styles.caption}>Narration: {item.narrationStatus}. Calculated data is shown below.</Text>}
    {item.metrics.map(metric => <Text key={metric.code} style={styles.body}>{metric.code.replace(/([a-z])([A-Z])/g, '$1 $2')}: {metric.current === null ? 'Not available' : /Rate|Share/.test(metric.code) ? `${metric.current}%` : formatMoney(metric.current, item.currencyCode)}{metric.previousDeltaPercent !== null ? ` · ${metric.previousDeltaPercent}% vs previous period` : ''}</Text>)}
    {item.categories.map(category => <Text key={category.subjectKey} style={styles.caption}>{category.name}: {formatMoney(category.amount, item.currencyCode)} · {category.transactionCount} transactions</Text>)}
    {item.judgements.map(observation)}
  </Card>;
  return <Page title="A useful nudge" error={mutation.error} onRefresh={() => { void (historyMode ? history.refetch() : report.refetch()); void active.refetch(); }} refreshing={historyMode ? history.isRefetching : report.isRefetching}>
    <ScopeLabel /><OperationNotice refresh={mutation.refresh} />
    <ChoiceField label="Report scope" value={reportScope} options={choices(['Personal', 'Household'])} onChange={value => setReportScope(value as JudgementReportScope)} />
    <ChoiceField label="Report cadence" value={cadence} options={choices(['Monthly', 'Weekly'])} onChange={value => setCadence(value as JudgementReportCadence)} />
    <Button title={historyMode ? 'View current report' : 'Browse report history'} secondary onPress={() => setHistoryMode(value => !value)} />
    {!historyMode && cadence === 'Monthly' ? <MonthControl value={month} onChange={setMonth} /> : !historyMode ? <Field label="Week (optional, YYYY-Www)" value={weeklyPeriod} onChangeText={setWeeklyPeriod} autoCapitalize="characters" maxLength={8} placeholder="Current week" /> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text> : null}
    <Text style={styles.heading}>Active insights</Text>
    {active.isPending ? <Loading /> : active.isError ? <ErrorNotice message="Active insights could not be loaded." onRetry={() => { void active.refetch(); }} /> : !active.data.length ? <EmptyState title="Nothing needs your attention" detail="Insights appear as enough tracked data becomes available." /> : active.data.map(observation)}
    <Text style={styles.heading}>{historyMode ? 'Report history' : 'Period report'}</Text>
    {historyMode ? history.isPending ? <Loading /> : history.isError ? <ErrorNotice message="Report history could not be loaded." onRetry={() => { void history.refetch(); }} /> : <>
      {history.data.pages.flatMap(page => page).map(reportCard)}
      {!history.data.pages[0]?.length ? <EmptyState title="No earlier reports" /> : null}
      {history.hasNextPage ? <Button title="Load earlier reports" secondary loading={history.isFetchingNextPage} onPress={() => { void history.fetchNextPage(); }} /> : null}
    </> : report.isPending ? <Loading /> : report.isError ? <ErrorNotice message="A report is not available for this period yet." onRetry={() => { void report.refetch(); }} /> : reportCard(report.data)}
    <Text style={styles.caption}>Based on tracked data in {currency}. Insights offer context for your decisions; incomplete records can affect conclusions.</Text>
  </Page>;
}
