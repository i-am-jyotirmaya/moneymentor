import { useEffect, useRef, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSession } from '../../src/auth/session';
import type { CategoryCatalog } from '../../src/api/models';
import type { Commitment, Goal, GoalDetail, GoalPlanningRun, GoalPlanVersion } from '../../src/api/workspace-models';
import { formatDate, formatMoney } from '../../src/lib/format';
import { colors, styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { emptyGoalForm, emptyPlanForm, goalPayload, goalProgress, goalValidation, planningGroups, planningPending, planPayload, planValidation, planningRequestKey } from '../../src/workspace/planning-data';
import { Action, Choice, ErrorNotice, Loading, Panel, ws } from '../../src/workspace/ui';

export default function Planning() {
  const { session } = useSession();
  const { householdId, dataRevision } = useWorkspace();
  return <PlanningScope key={`${session?.user.id}:${householdId}:${dataRevision}`} />;
}
function PlanningScope() {
  const { client } = useSession();
  const { householdId, households, dashboard, settings } = useWorkspace();
  const canWrite = households?.households.find(h => h.id === householdId)?.canWrite === true;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [catalog, setCatalog] = useState<CategoryCatalog | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<GoalDetail | null>(null);
  const [run, setRun] = useState<GoalPlanningRun | null>(null);
  const [loading, setLoading] = useState(!!householdId);
  const [loaded, setLoaded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [goalForm, setGoalForm] = useState(emptyGoalForm);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [context, setContext] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    if (!householdId) return;
    void Promise.all([client.listGoals(householdId), client.listCommitments(householdId), client.categories(householdId)]).then(([g, c, categories]) => {
      if (!current) return;
      setLoaded(true); setGoals(g); setCommitments(c); setCatalog(categories); setSelected(g[0]?.id ?? null); setDetail(null); setRun(null); setDetailLoading(!!g.length);
    }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not load planning.'); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, householdId, attempt]);
  useEffect(() => {
    let current = true;
    if (selected) void client.getGoal(selected).then(value => { if (current) setDetail(value); }).catch(() => { if (current) setError('Could not load this goal. Choose another goal or try again.'); }).finally(() => { if (current) setDetailLoading(false); });
    return () => { current = false; };
  }, [client, selected, attempt]);
  useEffect(() => {
    if (!run || !planningPending(run)) return;
    let current = true;
    const timer = setTimeout(() => {
      void client.getGoalPlanningRun(run.goalId, run.id).then(async next => {
        if (!current) return;
        if (next.status === 'Succeeded') {
          const value = await client.getGoal(next.goalId);
          if (current) { setDetail(value); setNotice('Your plan is ready.'); }
        } else if (next.status === 'Failed') setError(next.error ?? 'Plan generation failed. You can retry.');
        if (current) setRun(next);
      }).catch(() => { if (current) { setError('Could not refresh plan generation status.'); setRun(value => value ? { ...value } : value); } });
    }, 2000);
    return () => { current = false; clearTimeout(timer); };
  }, [client, run]);
  const money = (n: number) => formatMoney(n, dashboard?.currencyCode ?? settings?.currencyCode ?? 'INR');
  async function mutate(work: () => Promise<void>) {
    if (!canWrite || lock.current || !householdId) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not update planning.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function create() {
    const validation = goalValidation(goalForm);
    if (validation) { setError(validation); return; }
    await mutate(async () => {
      const goal = await client.createGoal(goalPayload(goalForm, householdId!));
      if (!alive.current) return;
      setGoals(items => [goal, ...items.filter(g => g.id !== goal.id)]); setSelected(goal.id); setDetail(null); setRun(null); setDetailLoading(true); setGoalForm(emptyGoalForm()); setNotice('Goal created. Generate a plan when you are ready.');
    });
  }
  async function planAction(action: 'generate' | 'activate' | 'review' | 'customize' | 'consent', version?: GoalPlanVersion) {
    if (!selected || !detail || planningPending(run)) return;
    if (action === 'generate' || action === 'customize') { const validation = planValidation(planForm); if (validation) { setError(validation); return; } }
    await mutate(async () => {
      const key = planningRequestKey();
      if (action === 'generate') { const next = await client.createGoalPlanningRun(selected, planPayload(planForm), key); if (alive.current) { setRun(next); setNotice('We are securely preparing your plan in the background.'); } return; }
      if (action === 'review' && version) { const next = await client.reviewGoalPlan(selected, version.id, key); if (alive.current) { setRun(next); setNotice('AI review started.'); } return; }
      let message: string | null = null;
      if (action === 'activate' && version) { await client.activateGoalPlan(selected, version.id, key); message = 'You are now following this plan.'; }
      if (action === 'customize' && version) {
        const source = version.options[0]; if (!source) return;
        const customized = await client.customizeGoalPlan(selected, version.id, { pace: planForm.pace || source.pace, targetDate: planForm.targetDate || undefined, monthlyContribution: planForm.monthlyContribution ? Number(planForm.monthlyContribution) : source.monthlyContribution, context: context || undefined });
        message = `Customized version ${customized.versionNumber} created.`;
      }
      if (action === 'consent') { if (detail.currentUserConsent?.revokedAt === null) await client.deleteGoalParticipantConsent(selected); else await client.putGoalParticipantConsent(selected); }
      const next = await client.getGoal(selected);
      if (alive.current) { setDetail(next); setNotice(message); }
    });
  }
  const disabled = !canWrite || busy || planningPending(run);
  const judgements = dashboard?.judgements ?? [];
  return <ScrollView automaticallyAdjustKeyboardInsets testID="planning-screen" style={ws.fill} contentContainerStyle={ws.content} keyboardShouldPersistTaps="handled" accessibilityState={{ busy: loading || busy }}>
    <Panel title="Planning"><Text style={styles.text}>Goals, SIPs, premiums, and rule-based nudges in one place.</Text>
      <View style={ws.row}>{[['Active goals', goals.filter(g => g.status === 'Active').length], ['Commitments', commitments.filter(c => c.isActive).length], ['Judgements', judgements.length]].map(([label, value]) => <View key={label}><Text style={ws.small}>{label}</Text><Text style={ws.heading}>{value}</Text></View>)}</View>
      {!canWrite ? <Text style={styles.text}>This household is read-only for you. Planning data is visible, but changes are disabled.</Text> : !loading && loaded ? <View style={{ gap: 12 }}>
        <Field label="Goal" value={goalForm.name} onChange={name => setGoalForm(f => ({ ...f, name }))} maxLength={128} placeholder="Emergency fund" />
        <Field label="Target amount" value={goalForm.targetAmount} onChange={targetAmount => setGoalForm(f => ({ ...f, targetAmount }))} numeric />
        <Choice label="Goal type" value={goalForm.goalType} options={['Saving', 'EmergencyFund', 'DebtPayoff', 'Purchase', 'Investment'].map(value => ({ value, label: value === 'EmergencyFund' ? 'Emergency fund' : value === 'DebtPayoff' ? 'Debt payoff' : value }))} onChange={goalType => setGoalForm(f => ({ ...f, goalType: goalType as Goal['goalType'] }))} />
        <Field label="Target date (optional)" id="goal-target-date" value={goalForm.targetDate} onChange={targetDate => setGoalForm(f => ({ ...f, targetDate }))} placeholder="YYYY-MM-DD" />
        <View style={ws.row}><Text style={styles.label}>Share with household</Text><Switch testID="goal-shared" accessibilityLabel="Share with household" value={goalForm.isShared} onValueChange={isShared => setGoalForm(f => ({ ...f, isShared }))} /></View>
        <Action testID="create-goal" title="Create goal" disabled={busy} onPress={() => void create()} />
      </View> : null}
    </Panel>
    {loading ? <Loading label="Loading planning" /> : null}
    {!householdId ? <Text style={styles.text}>Select a household to view planning.</Text> : null}
    <ErrorNotice error={error} retry={() => { setLoading(!!householdId); setLoaded(false); setSelected(null); setDetail(null); setRun(null); setDetailLoading(false); setError(null); setAttempt(n => n + 1); }} />
    {notice ? <Text testID="planning-notice" accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
    {!loading && loaded ? <>
      <Panel title="Current nudges">{judgements.length ? judgements.slice(0, 4).map((j, i) => <View key={i} style={ws.item}><Text style={styles.label}>{j.title}</Text><Text style={ws.small}>{j.severity ?? j.tone}</Text><Text style={styles.text}>{j.text}</Text></View>) : <Text style={styles.text}>No planning nudges for this month yet.</Text>}</Panel>
      <Panel title="Goals">{goals.length ? goals.slice(0, 8).map(g => <View key={g.id} style={ws.item}><Action testID={`goal-${g.id}`} title={g.name} selected={selected === g.id} disabled={busy} onPress={() => { if (selected !== g.id) { setSelected(g.id); setDetail(null); setRun(null); setDetailLoading(true); } setError(null); }} /><Text style={ws.small}>{g.goalType} - {g.priority} priority - {g.status}</Text><Text style={styles.label}>{money(g.currentAmount)}</Text><View accessibilityLabel={`${goalProgress(g)}% complete`} style={{ height: 8, backgroundColor: 'white' }}><View style={{ height: 8, width: `${goalProgress(g)}%`, backgroundColor: colors.accent }} /></View><Text style={ws.small}>{money(g.remainingAmount)} left{g.requiredMonthlyContribution ? ` - needs ${money(g.requiredMonthlyContribution)}/mo` : ''}</Text></View>) : <Text testID="planning-empty" style={styles.text}>No goals yet. Create your first goal above.</Text>}</Panel>
      <Panel title="Commitments">{commitments.length ? commitments.slice(0, 6).map(c => <View key={c.id} style={ws.item}><Text style={styles.label}>{c.name}</Text><Text style={ws.small}>{c.transactionType} - {c.cadence} - due {formatDate(c.nextDueDate)}</Text><Text style={styles.label}>{money(c.amount)}</Text><Text style={ws.small}>{c.isActive ? 'Active' : 'Paused'}</Text></View>) : <Text style={styles.text}>No recurring commitments tracked yet.</Text>}</Panel>
      <Panel title="AI goal planner"><Text style={styles.text}>Based on calculated aggregates from your tracked finances. AI explains the plan; Spndrr calculates the amounts.</Text>
        {run ? <Text testID="planning-run-status" style={ws.small}>{run.runType} · {run.status}</Text> : null}
        {detailLoading ? <Loading label="Loading goal" /> : !detail ? <Text style={styles.text}>Select a goal to generate or review a plan.</Text> : <>
          <Text style={styles.label}>{detail.goal.name}</Text><Text style={ws.small}>{money(detail.goal.remainingAmount)} remaining{detail.plan?.activeVersionId ? ' · following a plan' : ' · no followed plan'}</Text>
          {detail.goal.userProfileId === null ? <Action testID="goal-consent" title={detail.currentUserConsent?.revokedAt === null ? 'Revoke private aggregate consent' : 'Opt in private aggregates'} disabled={disabled} onPress={() => void planAction('consent')} /> : null}
          <Choice label="Pace (optional)" value={planForm.pace} options={[{ value: '', label: 'Show three paces' }, ...['Comfortable', 'Balanced', 'Aggressive'].map(value => ({ value, label: value }))]} onChange={pace => setPlanForm(f => ({ ...f, pace: pace as typeof f.pace }))} />
          <Field label="Target date (optional)" id="plan-target-date" value={planForm.targetDate} onChange={targetDate => setPlanForm(f => ({ ...f, targetDate }))} placeholder="YYYY-MM-DD" />
          <Field label="Monthly amount (optional)" value={planForm.monthlyContribution} onChange={monthlyContribution => setPlanForm(f => ({ ...f, monthlyContribution }))} numeric />
          <Action testID="generate-plan" title="Generate plan" disabled={disabled} onPress={() => void planAction('generate')} />
          {detail.plan?.versions.length ? detail.plan.versions.map(v => <View key={v.id} style={ws.item}><Text style={styles.label}>Version {v.versionNumber} · {v.source}</Text>
            <Action testID={`review-plan-${v.id}`} title="Review with AI" disabled={disabled} onPress={() => void planAction('review', v)} />
            <Action testID={`follow-plan-${v.id}`} title={detail.plan?.activeVersionId === v.id ? 'Following' : 'Follow this version'} disabled={disabled || detail.plan?.activeVersionId === v.id} onPress={() => void planAction('activate', v)} />
            {v.options.map(o => <View key={o.id} style={ws.card}><Text style={styles.label}>{o.title}</Text><Text style={ws.small}>{o.pace}</Text><Text style={ws.heading}>{money(o.monthlyContribution)}/mo</Text><Text style={ws.small}>Target {formatDate(o.projectedCompletionDate)} · {o.feasibility}</Text><Text style={styles.text}>{o.explanation}</Text>{o.risks.map((risk, i) => <Text key={i} style={styles.text}>• {risk}</Text>)}</View>)}
            <Field label="Plan customization context" id={`plan-context-${v.id}`} value={context} onChange={setContext} maxLength={1000} placeholder="Optional context for a customized version, for example: keep more room for school fees." multiline />
            <Action testID={`customize-plan-${v.id}`} title="Save customization" disabled={disabled || !v.options.length} onPress={() => void planAction('customize', v)} />
          </View>) : <Text style={styles.text}>No plan versions yet.</Text>}
        </>}
        <Text style={ws.small}>Guidance is based on tracked data and is not a guarantee or certified financial advice. Review assumptions before following a plan.</Text>
      </Panel>
      <Panel title="Category groups">{catalog && planningGroups(catalog.categories).length ? planningGroups(catalog.categories).map(g => <View key={g.id} style={ws.item}><Text style={styles.label}>{g.name}</Text><Text style={ws.small}>{g.classification} - {g.childCount} categories</Text></View>) : <Text style={styles.text}>Categories will appear after the catalog is loaded.</Text>}</Panel>
    </> : null}
  </ScrollView>;
}
function Field({ label, id, value, onChange, placeholder, maxLength, numeric, multiline }: { label: string; id?: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength?: number; numeric?: boolean; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput testID={id ?? label.toLowerCase().replaceAll(' ', '-')} accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChange} placeholder={placeholder} maxLength={maxLength} keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} autoCapitalize="none" /></View>;
}
