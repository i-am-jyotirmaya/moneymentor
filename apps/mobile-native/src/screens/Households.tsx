import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { HouseholdRole, HouseholdSummary } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, Loading, styles } from '../ui/primitives';
import { ChoiceField, Page } from '../ui/forms';
import { choices, EmptyState } from '../ui/workspace';

export function HouseholdsScreen() {
  const entry = useEntry(); const { api, scope, switchHousehold } = useWorkspace(); const mutation = useWorkspaceMutation({ allowReadOnly: true });
  const data = useQuery({ queryKey: ['households'], queryFn: api.households });
  const invitations = useQuery({ queryKey: ['invitations'], queryFn: api.invitations });
  const selected = data.data?.households.find(item => item.id === scope);
  const canManage = !!selected?.canWrite && ['Owner', 'Admin'].includes(selected.role);
  const sent = useQuery({ queryKey: ['sent-invitations', scope], queryFn: () => api.sentInvitations(scope), enabled: canManage && selected?.kind === 'Family' });
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState<HouseholdRole>('Member');
  const [message, setMessage] = useState<string | null>(null);
  const choose = (household: HouseholdSummary) => {
    if (household.id === scope || mutation.blocked || household.status !== 'Active') return;
    const apply = () => { void entry.runExclusive(async () => {
      try { await entry.discardDraft(); switchHousehold(household); } catch { mutation.setError('The draft could not be cleared securely. Your household has not changed.'); }
    }); };
    if (entry.draft.text || entry.draft.manual.amount) Alert.alert('Switch household?', 'Your unsent transaction draft will be cleared. Saved records stay in their original household.', [
      { text: 'Keep working', style: 'cancel' }, { text: 'Clear draft and switch', onPress: apply },
    ]); else apply();
  };
  const invite = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { mutation.setError('Enter a valid email address.'); return; }
    Alert.alert('Send household invitation?', `${email.trim()} will be invited to ${selected?.name ?? 'this household'} as ${role}.`, [
      { text: 'Cancel', style: 'cancel' }, { text: 'Send invitation', onPress: () => { void mutation.execute('Send household invitation', () => api.invite(scope, email.trim(), role), () => { setEmail(''); setMessage('Invitation created. Delivery status is shown below.'); }); } },
    ]);
  };
  return <Page title="Together, with boundaries" error={mutation.error} onRefresh={() => { void mutation.refresh(); }}>
    <OperationNotice refresh={mutation.refresh} />
    <Text style={styles.caption}>Choose whose finances you are viewing. Private entries stay private; shared visibility is always explicit. Pending writes must be reviewed before changing households.</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
    {data.isPending ? <Loading /> : data.isError ? <ErrorNotice message="Households could not be loaded." onRetry={() => { void data.refetch(); }} /> : <>
      <Text style={styles.caption}>Plan: {data.data.plan}. Household access is controlled by Spndrr.</Text>
      {data.data.households.filter(item => item.status === 'Active').map(item => <Card key={item.id}>
        <Text style={styles.heading}>{item.name}{item.id === scope ? ' · Selected' : ''}</Text><Text style={styles.caption}>{item.kind} · {item.role} · {item.memberCount} members · {item.currencyCode} · {item.timeZone}{!item.canWrite ? ' · View only' : ''}</Text>
        <Button title={item.id === scope ? 'Current household' : `Switch to ${item.name}`} secondary selected={item.id === scope} disabled={mutation.blocked || item.id === scope} onPress={() => choose(item)} />
      </Card>)}
      {data.data.canUseHouseholds ? <Card><Text style={styles.heading}>Create a household</Text><Field label="Household name" value={name} onChangeText={setName} maxLength={160} editable={!mutation.blocked} />
        <Button title="Create household" disabled={mutation.blocked || !name.trim()} onPress={() => { void mutation.execute('Create household', () => api.createHousehold(name.trim()), () => { setName(''); setMessage('Household created. Select it above to start tracking.'); }); }} />
      </Card> : <Text style={styles.caption}>Family households require an eligible plan. Personal tracking remains available.</Text>}
    </>}
    {selected && canManage ? <HouseholdSettings key={`${selected.id}-${selected.currencyCode}-${selected.timeZone}`} household={selected} /> : null}
    {canManage && selected?.kind === 'Family' ? <Card><Text style={styles.heading}>Invite a member</Text>
      <Field label="Member email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={256} editable={!mutation.blocked} />
      <ChoiceField label="Member role" value={role} options={choices(['Admin', 'Member', 'Viewer'])} onChange={value => setRole(value as HouseholdRole)} disabled={mutation.blocked} />
      <Button title="Send invitation" disabled={mutation.blocked || !email.trim()} onPress={invite} />
      {sent.isError ? <ErrorNotice message="Sent invitations could not be loaded." onRetry={() => { void sent.refetch(); }} /> : (sent.data ?? []).map(item => <Text key={item.id} style={styles.caption}>{item.email} · {item.role} · {item.status} · Delivery {item.deliveryStatus} · Expires {item.expiresAt.slice(0, 10)}</Text>)}
    </Card> : null}
    <Text style={styles.heading}>Invitations for you</Text>
    {invitations.isPending ? <Loading /> : invitations.isError ? <ErrorNotice message="Your invitations could not be loaded." onRetry={() => { void invitations.refetch(); }} /> : !invitations.data.length ? <EmptyState title="No invitations" /> : invitations.data.map(item => <Card key={item.id}>
      <Text style={styles.heading}>{item.householdName}</Text><Text style={styles.caption}>{item.invitedByDisplayName} invited you as {item.role} · {item.status} · Expires {item.expiresAt.slice(0, 10)}</Text>
      {item.status === 'Pending' ? <><Button title="Accept invitation" disabled={mutation.blocked} onPress={() => { void mutation.execute('Accept household invitation', () => api.respondToInvitation(item.id, 'accept')); }} />
        <Button title="Decline invitation" secondary disabled={mutation.blocked} onPress={() => { void mutation.execute('Decline household invitation', () => api.respondToInvitation(item.id, 'decline')); }} /></> : null}
    </Card>)}
  </Page>;
}

function HouseholdSettings({ household }: { household: HouseholdSummary }) {
  const { api } = useWorkspace(); const mutation = useWorkspaceMutation();
  const [currency, setCurrency] = useState(household.currencyCode); const [zone, setZone] = useState(household.timeZone);
  return <Card><Text style={styles.heading}>Household settings</Text>
    <Field label="Household currency" value={currency} onChangeText={value => setCurrency(value.toUpperCase())} autoCapitalize="characters" maxLength={3} editable={!mutation.blocked} />
    <Field label="Household time zone" value={zone} onChangeText={setZone} autoCapitalize="none" autoCorrect={false} maxLength={100} editable={!mutation.blocked} />
    <Button title="Save household settings" disabled={mutation.blocked} loading={mutation.busy} onPress={() => {
      try { if (!/^[A-Z]{3}$/.test(currency)) throw Error(); new Intl.DateTimeFormat('en', { timeZone: zone }).format(); }
      catch { mutation.setError('Enter a three-letter currency code and a valid time zone such as Asia/Kolkata.'); return; }
      void mutation.execute('Update household settings', () => api.updateHousehold(household.id, { currencyCode: currency, timeZone: zone }));
    }} />{mutation.error ? <ErrorNotice message={mutation.error} /> : null}
  </Card>;
}
