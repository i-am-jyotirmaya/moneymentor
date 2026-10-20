import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, parseMoney, type CreateGoal, type FinancialGoalPriority, type FinancialGoalStatus, type FinancialGoalType, type Goal, type GoalPlanPace, type GoalPlanningRun } from '@spndrr/finance-core';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { usePlanningRecords } from '../state/planning-runs';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, styles } from '../ui/primitives';
import { CalendarField, ChoiceField, MoneyField, Page, Toggle } from '../ui/forms';
import { Progress } from '../ui/finance';
import { choices, EmptyState, ScopeLabel } from '../ui/workspace';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

export function GoalsScreen({ navigation }: FeatureNavigationProps) {
  const { api, scope, currency } = useWorkspace(); const mutation = useWorkspaceMutation();
  const goals = useQuery({ queryKey: ['goals', scope], queryFn: () => api.goals(scope) });
  return <Page title="Make room for what matters" onRefresh={() => { void goals.refetch(); }} refreshing={goals.isRefetching}>
    <ScopeLabel /><Button title="Create a goal" disabled={mutation.blocked} onPress={() => navigation.navigate('GoalForm')} />
    <Button title="Recurring commitments" secondary onPress={() => navigation.navigate('Commitments')} />
    <OperationNotice refresh={mutation.refresh} />
    {goals.isPending ? <Loading /> : goals.isError ? <ErrorNotice message="Your goals could not be loaded." onRetry={() => { void goals.refetch(); }} /> : !goals.data.length ? <EmptyState title="Something to look forward to" detail="Create a saving, purchase, debt, investment or emergency-fund goal." /> : goals.data.map(goal => <Card key={goal.id}>
      <Text style={styles.heading}>{goal.name}</Text><Text style={styles.caption}>{goal.goalType} · {goal.priority} priority · {goal.status}{goal.userProfileId === null ? ' · Shared' : ''}</Text>
      <Text style={styles.body}>{formatMoney(goal.currentAmount, currency)} of {formatMoney(goal.targetAmount, currency)}</Text>
      <Progress value={goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0} label={`${goal.name} progress`} />
      <Text style={styles.caption}>{formatMoney(goal.remainingAmount, currency)} remaining{goal.targetDate ? ` · Target ${goal.targetDate}` : ''}</Text>
      <Button title={`Open ${goal.name}`} secondary onPress={() => navigation.navigate('Goal', { id: goal.id })} />
    </Card>)}
  </Page>;
}

export function GoalFormScreen(props: ScreenProps<'GoalForm'>) {
  const { api, scope } = useWorkspace(); const id = props.route.params?.id;
  const data = useQuery({ queryKey: ['goal', scope, id], queryFn: () => api.goal(id!), enabled: !!id });
  if (id && (data.isPending || data.isError || data.data.goal.householdId !== scope)) return <Page>{data.isPending ? <Loading /> : <ErrorNotice message="This goal could not be loaded in this household." onRetry={() => { void data.refetch(); }} />}</Page>;
  return <GoalEditor {...props} goal={data.data?.goal} />;
}
function GoalEditor({ navigation, goal }: ScreenProps<'GoalForm'> & { goal?: Goal }) {
  const { api, scope, currency, today } = useWorkspace(); const mutation = useWorkspaceMutation();
  const [name, setName] = useState(goal?.name ?? ''); const [type, setType] = useState<FinancialGoalType>(goal?.goalType ?? 'Saving');
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : ''); const [monthly, setMonthly] = useState(goal?.monthlyTarget === null || !goal ? '' : String(goal.monthlyTarget));
  const [date, setDate] = useState(goal?.targetDate ?? ''); const [priority, setPriority] = useState<FinancialGoalPriority>(goal?.priority ?? 'Medium');
  const [status, setStatus] = useState<FinancialGoalStatus>(goal?.status ?? 'Active'); const [shared, setShared] = useState(goal ? goal.userProfileId === null : false); const [saved, setSaved] = useState(false);
  const save = () => {
    const targetCents = parseMoney(target); const monthlyCents = monthly ? parseMoney(monthly) : null;
    if (!name.trim() || targetCents === null || (monthly && monthlyCents === null)) { mutation.setError('Enter a name and positive amounts with up to two decimal places.'); return; }
    const input: CreateGoal = { householdId: scope, name: name.trim(), goalType: type, targetAmount: targetCents / 100, ...(date ? { targetDate: date } : {}), ...(monthlyCents !== null ? { monthlyTarget: monthlyCents / 100 } : {}), priority, isShared: shared };
    void mutation.execute(goal ? 'Update goal' : 'Create goal', () => goal
      ? api.updateGoal(goal.id, { name: input.name, goalType: type, targetAmount: input.targetAmount, targetDate: date || null, monthlyTarget: monthlyCents === null ? null : monthlyCents / 100, priority, status })
      : api.createGoal(input), () => setSaved(true));
  };
  return <Page title={goal ? 'Edit goal' : 'A new goal'} error={mutation.error}><OperationNotice refresh={mutation.refresh} />
    {saved ? <Card><Text accessibilityLiveRegion="polite" style={styles.heading}>Goal saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></Card> : <>
      <Field label="Goal name" value={name} onChangeText={setName} maxLength={160} editable={!mutation.blocked} />
      <ChoiceField label="Goal type" value={type} options={choices(['Saving', 'DebtPayoff', 'Purchase', 'Investment', 'EmergencyFund'])} onChange={value => setType(value as FinancialGoalType)} disabled={mutation.blocked} />
      <MoneyField label="Target amount" currency={currency} value={target} onChange={setTarget} disabled={mutation.blocked} />
      <MoneyField label="Monthly target (optional)" currency={currency} value={monthly} onChange={setMonthly} disabled={mutation.blocked} />
      <CalendarField label="Target date" value={date} onChange={setDate} today={today} allowFuture optional disabled={mutation.blocked} />
      <ChoiceField label="Priority" value={priority} options={choices(['Low', 'Medium', 'High'])} onChange={value => setPriority(value as FinancialGoalPriority)} disabled={mutation.blocked} />
      {goal ? <ChoiceField label="Status" value={status} options={choices(['Active', 'Completed', 'Paused', 'Cancelled'])} onChange={value => setStatus(value as FinancialGoalStatus)} disabled={mutation.blocked} /> : <Toggle label="Shared household goal" value={shared} onChange={setShared} disabled={mutation.blocked} />}
      <Button title="Save goal" disabled={mutation.blocked} loading={mutation.busy} onPress={save} />
    </>}
  </Page>;
}

export function GoalScreen({ navigation, route }: ScreenProps<'Goal'>) {
  const { api, scope, currency, today } = useWorkspace(); const mutation = useWorkspaceMutation(); const query = useQueryClient(); const records = usePlanningRecords();
  const id = route.params.id;
  const detail = useQuery({ queryKey: ['goal', scope, id], queryFn: () => api.goal(id) });
  const record = records.records[id]; const runId = record?.householdId === scope ? record.runId : undefined;
  const run = useQuery({ queryKey: ['planning-run', scope, id, runId], queryFn: () => api.planningRun(id, runId!), enabled: !!runId,
    refetchInterval: state => ['Pending', 'Processing'].includes(state.state.data?.status ?? '') ? 2500 : false, refetchIntervalInBackground: false });
  const runStatus = run.data?.status;
  useEffect(() => { if (runStatus && !['Pending', 'Processing'].includes(runStatus)) void query.invalidateQueries({ queryKey: ['goal', scope, id] }); }, [runStatus, scope, id, query]);
  const [amount, setAmount] = useState(''); const [contributionDate, setContributionDate] = useState(today); const [message, setMessage] = useState<string | null>(null);
  const [pace, setPace] = useState<GoalPlanPace | 'all'>('all'); const [date, setDate] = useState(''); const [monthly, setMonthly] = useState(''); const [context, setContext] = useState('');
  const working = !!runId && (run.isPending || run.isError || ['Pending', 'Processing'].includes(run.data?.status ?? ''));
  const planBlocked = mutation.blocked || working || !records.ready;
  async function remember(result: GoalPlanningRun) { await records.remember({ goalId: id, runId: result.id, householdId: scope }); return result; }
  const generate = () => {
    const cents = monthly ? parseMoney(monthly) : null;
    if (monthly && cents === null) { mutation.setError('Enter a positive monthly contribution.'); return; }
    void mutation.execute('Generate goal plan', async () => remember(await api.startPlan(id, { ...(pace !== 'all' ? { pace } : {}), ...(date ? { targetDate: date } : {}), ...(cents !== null ? { monthlyContribution: cents / 100 } : {}), locale: 'en-IN' }, Crypto.randomUUID())));
  };
  const contribute = () => {
    const cents = parseMoney(amount); if (cents === null) { mutation.setError('Enter a positive contribution with up to two decimal places.'); return; }
    void mutation.execute('Add goal contribution', () => api.contribute(id, { amount: cents / 100, contributedAt: contributionDate, source: 'Manual' }), () => { setAmount(''); setMessage('Contribution recorded.'); });
  };
  const consent = () => {
    const active = !!detail.data?.currentUserConsent && detail.data.currentUserConsent.revokedAt === null;
    Alert.alert(active ? 'Revoke private aggregate consent?' : 'Include your private aggregates?', active ? 'Your private aggregates will no longer be included in future shared-goal planning runs.' : 'Shared-goal planning can include minimized aggregates from your private finances. Other members do not receive your individual transactions. You can revoke this permission.', [
      { text: 'Cancel', style: 'cancel' }, { text: active ? 'Revoke consent' : 'Allow private aggregates', onPress: () => { void mutation.execute('Update goal participant consent', async () => { if (active) await api.revokeConsent(id); else await api.grantConsent(id); }); } },
    ]);
  };
  const goal = detail.data?.goal;
  return <Page title={goal?.name ?? 'Your goal'} error={mutation.error} onRefresh={() => { void detail.refetch(); if (runId) void run.refetch(); }} refreshing={detail.isRefetching}>
    <OperationNotice refresh={mutation.refresh} />
    {detail.isPending ? <Loading /> : detail.isError || goal?.householdId !== scope ? <ErrorNotice message="The goal could not be loaded in this household." onRetry={() => { void detail.refetch(); }} /> : goal && detail.data ? <>
      <Card><Text style={styles.heading}>{formatMoney(goal.currentAmount, currency)} of {formatMoney(goal.targetAmount, currency)}</Text><Progress value={goal.currentAmount / goal.targetAmount} label="Goal progress" />
        <Text style={styles.caption}>{goal.status} · {formatMoney(goal.remainingAmount, currency)} remaining</Text>
        {goal.requiredMonthlyContribution !== null ? <Text style={styles.body}>Required monthly: {formatMoney(goal.requiredMonthlyContribution, currency)}</Text> : null}
        {goal.projectedCompletionDate ? <Text style={styles.caption}>Projected completion: {goal.projectedCompletionDate}</Text> : null}
        <Button title="Edit goal" secondary disabled={mutation.blocked} onPress={() => navigation.navigate('GoalForm', { id })} />
      </Card>
      <Card><Text style={styles.heading}>Add a contribution</Text><Text style={styles.caption}>Records progress toward this goal. This does not create a separate account transaction.</Text>
        <MoneyField label="Contribution" currency={currency} value={amount} onChange={setAmount} disabled={mutation.blocked} />
        <CalendarField label="Contribution date" today={today} value={contributionDate} onChange={setContributionDate} disabled={mutation.blocked} />
        <Button title="Record contribution" disabled={mutation.blocked} loading={mutation.busy} onPress={contribute} />
        {message ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{message}</Text> : null}
      </Card>
      <Text style={styles.heading}>AI goal planner</Text><Text style={styles.caption}>Spndrr calculates the amounts using tracked aggregates. AI explains options, trade-offs and assumptions. Projections may change with your finances.</Text>
      {goal.userProfileId === null ? <Button title={detail.data.currentUserConsent?.revokedAt === null ? 'Revoke private aggregate consent' : 'Opt in private aggregates'} secondary disabled={mutation.blocked} onPress={consent} /> : null}
      {records.error ? <ErrorNotice message={records.error} onRetry={records.retry} /> : null}
      {runId ? <Card><Text accessibilityLiveRegion="polite" style={styles.body}>Plan {run.data?.runType ?? 'request'} · {run.data?.status ?? 'Checking saved progress…'}</Text>
        {run.data?.error ? <Text style={styles.caption}>{run.data.error}</Text> : null}
        {run.isError ? <ErrorNotice message="Plan progress could not be checked. Refresh before starting another run." onRetry={() => { void run.refetch(); }} /> : null}
      </Card> : null}
      <ChoiceField label="Plan pace" value={pace} options={[{ id: 'all', label: 'Show all paces' }, ...choices(['Comfortable', 'Balanced', 'Aggressive'])]} onChange={value => setPace(value as GoalPlanPace | 'all')} disabled={planBlocked} />
      <CalendarField label="Plan target date" today={today} value={date} onChange={setDate} allowFuture optional disabled={planBlocked} />
      <MoneyField label="Plan monthly contribution (optional)" currency={currency} value={monthly} onChange={setMonthly} disabled={planBlocked} />
      <Button title="Generate plan" disabled={planBlocked} loading={mutation.busy} onPress={generate} />
      <Field label="Customization context (optional)" value={context} onChangeText={setContext} multiline maxLength={1000} editable={!planBlocked} />
      {detail.data.plan?.versions.map(version => <Card key={version.id}>
        <Text style={styles.heading}>Version {version.versionNumber} · {version.source}</Text><Text style={styles.caption}>{detail.data.plan?.activeVersionId === version.id ? 'Following this version' : 'Available plan version'}</Text>
        {version.options.map(option => <View key={option.id} style={{ gap: 12 }}><Text style={styles.heading}>{option.title}{option.isRecommended ? ' · Suggested' : ''}</Text>
          <Text style={styles.body}>{formatMoney(option.monthlyContribution, currency)} per month · {option.pace}</Text><Text style={styles.caption}>{option.feasibility} · Projected {option.projectedCompletionDate}</Text><Text style={styles.body}>{option.explanation}</Text>
          {option.tradeOffs.map((text, index) => <Text key={`trade-${index}`} style={styles.caption}>Trade-off: {text}</Text>)}
          {option.assumptions.map((text, index) => <Text key={`assumption-${index}`} style={styles.caption}>Assumption: {text}</Text>)}
          {option.risks.map((text, index) => <Text key={`risk-${index}`} style={styles.caption}>Risk: {text}</Text>)}
          {option.milestones.map((milestone, index) => <Text key={`milestone-${index}`} style={styles.caption}>{milestone.label}: {formatMoney(milestone.targetAmount, currency)} by {milestone.targetDate}</Text>)}
        </View>)}
        <Button title="Follow this version" disabled={planBlocked || detail.data.plan?.activeVersionId === version.id} onPress={() => { void mutation.execute('Activate goal plan', () => api.activatePlan(id, version.id, Crypto.randomUUID())); }} />
        <Button title="Review with AI" secondary disabled={planBlocked} onPress={() => { void mutation.execute('Review goal plan', async () => remember(await api.reviewPlan(id, version.id, Crypto.randomUUID()))); }} />
        <Button title="Customize this version" secondary disabled={planBlocked} onPress={() => {
          const cents = monthly ? parseMoney(monthly) : null;
          if (monthly && cents === null) { mutation.setError('Enter a positive monthly contribution.'); return; }
          if (!date && cents === null) { mutation.setError('Choose a plan target date or monthly contribution above.'); return; }
          void mutation.execute('Customize goal plan', () => api.customizePlan(id, version.id, { pace: pace === 'all' ? 'Custom' : pace, ...(date ? { targetDate: date } : {}), ...(cents !== null ? { monthlyContribution: cents / 100 } : {}), ...(context.trim() ? { context: context.trim() } : {}) }));
        }} />
      </Card>)}
    </> : null}
  </Page>;
}
