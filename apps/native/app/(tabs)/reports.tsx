import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import type { JudgementReportObservation, JudgementReportScope } from '../../src/api/workspace-models';
import { useSession } from '../../src/auth/session';
import { styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { canUseHouseholdReportScope, explanationValidation, reportError, reportScope } from '../../src/workspace/reports-data';
import { Action, Loading, Panel, ws } from '../../src/workspace/ui';

export default function Reports() {
  const { householdId, households } = useWorkspace();
  const { session } = useSession();
  const household = households?.households.find(item => item.id === householdId);
  return <ReportsScope key={`${session?.user.id}:${householdId}:${household?.kind}`} allowHouseholdScope={canUseHouseholdReportScope(household)} />;
}
function ReportsScope({ allowHouseholdScope }: { allowHouseholdScope: boolean }) {
  const [requested, setScope] = useState<JudgementReportScope>('Personal');
  const { households, householdId, dataRevision } = useWorkspace();
  const scope = reportScope(requested, households?.households.find(item => item.id === householdId));
  return <ReportList key={`${scope}:${dataRevision}`} scope={scope} allowHouseholdScope={allowHouseholdScope} onScopeChange={setScope} />;
}
function ReportList({ scope, allowHouseholdScope, onScopeChange }: { scope: JudgementReportScope; allowHouseholdScope: boolean; onScopeChange: (scope: JudgementReportScope) => void }) {
  const { client } = useSession();
  const { householdId } = useWorkspace();
  const [judgments, setJudgments] = useState<JudgementReportObservation[]>([]);
  const [loading, setLoading] = useState(!!householdId);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [explanation, setExplanation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    if (!householdId) return;
    void client.listActiveJudgements({ householdId, scope })
      .then(items => { if (current) setJudgments(items); })
      .catch(caught => { if (current) setError(reportError(caught)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, householdId, scope]);
  async function save(id: string, action: 'dismiss' | 'explain') {
    if (lock.current) return;
    const text = explanation.trim();
    if (action === 'explain') {
      const validation = explanationValidation(text);
      if (validation) { setError(validation); return; }
    }
    lock.current = true; setSavingId(id); setError(null);
    try {
      if (action === 'dismiss') await client.dismissJudgement(id);
      else await client.explainJudgement(id, text);
      if (!alive.current) return;
      setReplyingTo(null);
      if (action === 'dismiss') setJudgments(items => items.filter(item => item.id !== id));
      else { setExplanation(''); setNotice('Your explanation was saved for review and may inform future judgments.'); }
    } catch (caught) { if (alive.current) setError(reportError(caught)); }
    finally { lock.current = false; if (alive.current) setSavingId(null); }
  }
  return <ScrollView testID="reports-screen" style={ws.fill} contentContainerStyle={ws.content} accessibilityState={{ busy: loading }} keyboardShouldPersistTaps="handled">
    <View><Text style={styles.text}>Based on your tracked activity</Text><Text style={styles.title}>Judgments</Text><Text style={styles.text}>Patterns worth a closer look. Ordinary spending may produce no judgment.</Text></View>
    {allowHouseholdScope ? <View style={ws.row} accessibilityLabel="Judgment scope">{(['Personal', 'Household'] as const).map(option => <Action key={option} testID={`reports-scope-${option.toLowerCase()}`} title={option} selected={scope === option} onPress={() => onScopeChange(option)} />)}</View> : null}
    {loading ? <Loading label="Loading judgments" /> : null}
    {error ? <Text testID="reports-error" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text testID="reports-notice" accessibilityLiveRegion="polite" style={[styles.text, { color: '#065F46' }]}>{notice}</Text> : null}
    {!loading && !error && judgments.length === 0 ? <Panel title="Nothing needs your attention right now"><Text testID="reports-empty" style={styles.text}>The engine reviews patterns daily and stays quiet when it has nothing useful to add.</Text></Panel> : null}
    {!loading ? judgments.map(item => <View testID={`judgment-${item.id}`} key={item.id} style={ws.card}>
      <View style={ws.row}><Text style={ws.small}>{item.decisionAction ?? 'Observation'}</Text>{item.value ? <Text style={styles.label}>{item.value}</Text> : null}</View>
      <Text style={ws.heading}>{item.title}</Text><Text style={styles.text}>{item.message}</Text>
      {item.followUpQuestion ? <Text style={styles.label}>{item.followUpQuestion}</Text> : null}
      {replyingTo === item.id ? <View style={styles.field}>
        <Text style={styles.label}>Your explanation</Text>
        <TextInput testID={`explanation-${item.id}`} accessibilityLabel="Your explanation" style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]} multiline maxLength={2000} placeholder="Was this planned, temporary, or reimbursable?" value={explanation} onChangeText={setExplanation} />
        <View style={ws.row}><Action testID={`send-explanation-${item.id}`} title="Send explanation" disabled={savingId !== null} onPress={() => void save(item.id, 'explain')} /><Action title="Cancel" onPress={() => { setReplyingTo(null); setExplanation(''); }} /></View>
      </View> : <View style={ws.row}>
        <Action testID={`add-context-${item.id}`} title="Add context" onPress={() => { setExplanation(''); setNotice(null); setReplyingTo(item.id); }} />
        <Action testID={`dismiss-${item.id}`} title="Dismiss" disabled={savingId !== null} onPress={() => void save(item.id, 'dismiss')} />
      </View>}
    </View>) : null}
  </ScrollView>;
}
