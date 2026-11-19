import { useSectionLoad, SectionPanel } from '../../src/workspace/sections';
import { useOffline } from '../../src/workspace/connection';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { JudgementReportScope } from '../../src/api/workspace-models';
import { useSession } from '../../src/auth/session';
import { Button as FormButton, PlaceholderInput } from '../../src/ui/AuthForm';
import { Badge, Segmented, Text } from '../../src/ui';

import { useWorkspace } from '../../src/workspace/context';
import { canUseHouseholdReportScope, explanationValidation, judgmentBadge, reportError, reportScope } from '../../src/workspace/reports-data';
import { Action, ErrorNotice, Loading, Panel } from '../../src/workspace/ui';
import { useLegacy } from '../../src/workspace/legacy-styles';
import { useDockSpace } from '../../src/workspace/dock';

export default function Reports() {
  const { householdId, households } = useWorkspace();
  const { session } = useSession();
  const household = households?.households.find(item => item.id === householdId);
  return <ReportsScope key={`${session?.user.id}:${householdId}:${household?.kind}`} allowHouseholdScope={canUseHouseholdReportScope(household)} />;
}
function ReportsScope({ allowHouseholdScope }: { allowHouseholdScope: boolean }) {
  const [requested, setScope] = useState<JudgementReportScope>('Personal');
  const { households, householdId } = useWorkspace();
  const scope = reportScope(requested, households?.households.find(item => item.id === householdId));
  return <ReportList key={scope} scope={scope} allowHouseholdScope={allowHouseholdScope} onScopeChange={setScope} />;
}
function ReportList({ scope, allowHouseholdScope, onScopeChange }: { scope: JudgementReportScope; allowHouseholdScope: boolean; onScopeChange: (scope: JudgementReportScope) => void }) { const { styles, colors, ws } = useLegacy(); const dock = useDockSpace();
  const { client } = useSession();
  const offline = useOffline();
  const { householdId } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [explanation, setExplanation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const section = useSectionLoad('reports', JSON.stringify(['reports', householdId, scope]), () => client.listActiveJudgements({ householdId: householdId!, scope }), items => items.length === 0, !!householdId);
  const judgments = section.data ?? [];
  const loading = section.loading;
  async function save(id: string, action: 'dismiss' | 'explain') {
    if (offline || lock.current) return;
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
      if (action === 'dismiss') section.setData(items => items.filter(item => item.id !== id));
      else { setExplanation(''); setNotice('Your explanation was saved for review and may inform future judgments.'); }
    } catch (caught) { if (alive.current) setError(reportError(caught)); }
    finally { lock.current = false; if (alive.current) setSavingId(null); }
  }
  if (section.blocked || section.loading) return <SectionPanel section={section} />;
  return <ScrollView testID="reports-screen" style={ws.fill} contentContainerStyle={[ws.content, { paddingBottom: dock + 24 }]} accessibilityState={{ busy: loading }} keyboardShouldPersistTaps="handled">
    {allowHouseholdScope ? <View testID={`reports-scope-${scope.toLowerCase()}`} collapsable={false}><Segmented<JudgementReportScope> label="Judgment scope" options={[{ key: 'Personal', label: 'Personal' }, { key: 'Household', label: 'Household' }]} value={scope} onChange={onScopeChange} /></View> : null}
    <Text style={styles.text}>Patterns worth a closer look. Ordinary months stay quiet.</Text>
    {loading ? <Loading label="Loading judgments" /> : null}
    <ErrorNotice error={error} retry={() => { setError(null); section.retry(); }} />
    {notice ? <Text testID="reports-notice" accessibilityLiveRegion="polite" style={[styles.text, { color: colors.accent }]}>{notice}</Text> : null}
    {!loading && !error && judgments.length === 0 ? <Panel title="Nothing needs your attention right now"><Text testID="reports-empty" style={styles.text}>The engine reviews patterns daily and stays quiet when it has nothing useful to add.</Text></Panel> : null}
    {!loading ? judgments.map(item => <View testID={`judgment-${item.id}`} key={item.id} style={ws.card}>
      <View style={ws.row}><Badge {...judgmentBadge(item)} />{item.value ? <Text variant="title" numeric>{item.value}</Text> : null}</View>
      <Text variant="titleL">{item.title}</Text><Text style={styles.text}>{item.message}</Text>
      {item.followUpQuestion ? <Text style={styles.label}>{item.followUpQuestion}</Text> : null}
      {replyingTo === item.id ? <View style={styles.field}>
        <Text style={styles.label}>Your explanation</Text>
        <PlaceholderInput testID={`explanation-${item.id}`} accessibilityLabel="Your explanation" style={[styles.input, { minHeight: 96, textAlignVertical: 'top' }]} multiline maxLength={2000} placeholder="Was this planned, temporary, or reimbursable?" value={explanation} onChangeText={setExplanation} />
        <View style={ws.row}><Action write testID={`send-explanation-${item.id}`} title="Send explanation" disabled={savingId !== null} onPress={() => void save(item.id, 'explain')} /><Action title="Cancel" onPress={() => { setReplyingTo(null); setExplanation(''); }} /></View>
      </View> : <View style={ws.row}>
        <FormButton testID={`add-context-${item.id}`} variant="tonal" icon={{ android: 'edit_note', ios: 'square.and.pencil' }} fullWidth={false} title="Add context" onPress={() => { setExplanation(''); setNotice(null); setReplyingTo(item.id); }} />
        <FormButton write variant="text" testID={`dismiss-${item.id}`} fullWidth={false} title="Dismiss" disabled={savingId !== null} onPress={() => void save(item.id, 'dismiss')} />
      </View>}
    </View>) : null}
  </ScrollView>;
}
