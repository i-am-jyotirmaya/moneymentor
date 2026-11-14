import { useSectionLoad, SectionPanel } from '../../src/workspace/sections';
import { useOffline } from '../../src/workspace/connection';
import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { HouseholdRole } from '../../src/api/workspace-models';
import { useSession } from '../../src/auth/session';
import { formatDate } from '../../src/lib/format';
import { Button, Field } from '../../src/ui/AuthForm';
import { styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { canCreateHousehold, canEditReportSettings, canListSentInvitations, canManageHousehold, invitationValidation, reportingValidation } from '../../src/workspace/household-data';
import { Action, Choice, ErrorNotice, Loading, Panel, ws } from '../../src/workspace/ui';

export default function Household() {
  const { client } = useSession();
  const offline = useOffline();
  const { households, householdId, setHouseholdId, retry } = useWorkspace();
  const selected = households?.households.find(h => h.id === householdId);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<HouseholdRole>('Member');
  const [draft, setDraft] = useState<{ id: string; currency: string; zone: string } | null>(null);
  const currency = draft?.id === selected?.id ? draft?.currency ?? '' : selected?.currencyCode ?? '';
  const zone = draft?.id === selected?.id ? draft?.zone ?? '' : selected?.timeZone ?? '';
  const setCurrency = (value: string) => setDraft({ id: selected?.id ?? '', currency: value, zone });
  const setZone = (value: string) => setDraft({ id: selected?.id ?? '', currency, zone: value });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listSent = canListSentInvitations(selected);
  const section = useSectionLoad('household', JSON.stringify(['household', householdId, listSent]), async () => {
    const [incoming, outgoing] = await Promise.all([client.householdInvitations(), listSent && householdId ? client.sentHouseholdInvitations(householdId) : Promise.resolve([])]);
    return { incoming, outgoing };
  });
  const loaded = !!section.data;
  const invitations = section.data?.incoming ?? [];
  const sent = section.data?.outgoing ?? [];
  async function save(work: () => Promise<void>) {
    if (offline || lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { await work(); section.retry(); retry(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update the household.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!households || section.blocked || section.loading) return <SectionPanel section={section} />;
  return <ScrollView automaticallyAdjustKeyboardInsets testID="household-screen" keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}>
    <Panel title="Household"><Text style={styles.text}>Personal is the default scope. Premium entitlement is managed by Spndrr support.</Text><Text style={styles.link}>{households.plan}</Text>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
      <ErrorNotice error={error} retry={() => { setError(null); section.retry(); }} />
      {!loaded ? <Loading label="Loading invitations" /> : null}
      {loaded && invitations.length ? <Panel title="Invitations for you">{invitations.map(i => <View key={i.id} style={ws.item}><Text style={styles.label}>{i.householdName}</Text><Text style={styles.text}>{i.invitedByDisplayName} invited you as {i.role}. Expires {formatDate(i.expiresAt)}.</Text><View style={ws.row}>{(['decline', 'accept'] as const).map(response => <Action write key={response} testID={`invitation-${response}-${i.id}`} title={response === 'accept' ? 'Accept' : 'Decline'} disabled={busy} onPress={() => void save(async () => {
        const result = await client.respondToHouseholdInvitation(i.id, response);
        if (response === 'accept') setHouseholdId(result.householdId);
        setNotice(response === 'accept' ? `You joined ${result.householdName}.` : `Invitation to ${result.householdName} declined.`);
      })} />)}</View></View>)}</Panel> : null}
      {households.households.length ? households.households.map(h => <View key={h.id} style={ws.item}><Action testID={`household-${h.id}`} selected={h.id === householdId} title={h.name} onPress={() => setHouseholdId(h.id)} /><Text style={styles.text}>{h.role}</Text><Text style={styles.text}>{h.memberCount} member{h.memberCount === 1 ? '' : 's'} - {h.status}</Text><Text style={ws.small}>{h.currencyCode} · {h.timeZone}</Text></View>) : <Text style={styles.text}>No households are available.</Text>}
      {loaded && sent.length ? <Panel title="Sent invitations">{sent.map(i => <View key={i.id} style={ws.item}><Text style={styles.label}>{i.email}</Text><Text style={styles.text}>{i.role} - {i.status}</Text><Text style={styles.link}>{i.deliveryStatus}</Text></View>)}</Panel> : null}
    </Panel>
    {selected ? <Panel title="Report settings"><Text style={styles.text}>Time zone changes apply to future report windows. Currency locks after the first transaction.</Text><Field label="Currency" testID="household-currency" maxLength={3} value={currency} onChangeText={setCurrency} /><Field label="IANA time zone" placeholder="Asia/Kolkata" value={zone} onChangeText={setZone} autoCapitalize="none" /><Button write testID="save-household-settings" title={busy ? 'Saving...' : 'Save report settings'} disabled={busy || !canEditReportSettings(selected)} onPress={() => {
      if (!canEditReportSettings(selected)) return;
      const input = { currencyCode: currency.trim().toUpperCase(), timeZone: zone.trim() };
      const invalid = reportingValidation(input.currencyCode, input.timeZone); if (invalid) { setError(invalid); return; }
      void save(async () => { await client.updateHouseholdSettings(selected.id, input); setNotice('Household reporting settings saved.'); });
    }} /></Panel> : null}
    <Panel title="Create household"><Field label="Household name" value={name} onChangeText={setName} placeholder="Family workspace" /><Button write testID="create-household" title="Create household" disabled={busy || !canCreateHousehold(households)} onPress={() => {
      if (!name.trim() || !canCreateHousehold(households)) return;
      void save(async () => { const h = await client.createHousehold(name.trim()); setHouseholdId(h.id); setName(''); setNotice(`${h.name} is ready.`); });
    }} /></Panel>
    <Panel title="Invite member"><Text style={styles.text}>They can accept after signing in with this email.</Text><Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" /><Choice label="Role" value={role} options={['Admin', 'Member', 'Viewer'].map(value => ({ value, label: value }))} onChange={v => setRole(v as HouseholdRole)} /><Button write testID="invite-member" title="Send invitation" disabled={busy || !canManageHousehold(selected)} onPress={() => {
      if (!selected || !canManageHousehold(selected) || !email.trim()) return;
      const invalid = invitationValidation(email); if (invalid) { setError(invalid); return; }
      void save(async () => { await client.createHouseholdInvitation(selected.id, { email: email.trim(), role }); setNotice(`Invitation sent to ${email.trim()}.`); setEmail(''); });
    }} /></Panel>
  </ScrollView>;
}
