import { useState } from 'react';
import { Text } from 'react-native';
import type { FinancialAccount, SaveFinancialAccount } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';
import { ChoiceField, Page, Toggle } from '../ui/forms';
import { choices, EmptyState, ScopeLabel } from '../ui/workspace';
import type { FeatureNavigationProps, ScreenProps } from '../navigation';

export function AccountsScreen({ navigation }: FeatureNavigationProps) {
  const entry = useEntry(); const mutation = useWorkspaceMutation();
  return <Page title="Accounts you use" onRefresh={() => { void mutation.refresh(); }} error={mutation.error}>
    <ScopeLabel /><OperationNotice refresh={mutation.refresh} />
    <Text style={styles.caption}>Keep bank accounts, cards, cash and wallets separate. Names and aliases help the assistant choose the exact account.</Text>
    <Button title="Add financial account" disabled={mutation.blocked} onPress={() => navigation.navigate('AccountForm')} />
    {!entry.resources.accounts.length ? <EmptyState title="No accounts yet" /> : entry.resources.accounts.map(item => <Card key={item.id}>
      <Text style={styles.heading}>{item.name}</Text><Text style={styles.caption}>{item.accountType} · {item.currencyCode} · {item.isActive ? 'Active' : 'Inactive'} · {item.ownerUserProfileId === null ? 'Shared' : 'Personal'}</Text>
      {item.institution ? <Text style={styles.body}>{item.institution}{item.last4 ? ` · ending ${item.last4}` : ''}</Text> : null}
      {item.aliases.length ? <Text style={styles.caption}>Also called: {item.aliases.join(', ')}</Text> : null}
      <Button title={`Manage ${item.name}`} secondary onPress={() => navigation.navigate('AccountForm', { id: item.id })} />
    </Card>)}
  </Page>;
}

export function AccountFormScreen({ navigation, route }: ScreenProps<'AccountForm'>) {
  const entry = useEntry(); const { api, scope } = useWorkspace(); const mutation = useWorkspaceMutation();
  const original = entry.resources.accounts.find(item => item.id === route.params?.id);
  const [name, setName] = useState(original?.name ?? ''); const [type, setType] = useState<FinancialAccount['accountType']>(original?.accountType ?? 'BankAccount');
  const [institution, setInstitution] = useState(original?.institution ?? ''); const [last4, setLast4] = useState(original?.last4 ?? '');
  const [aliases, setAliases] = useState(original?.aliases.join(', ') ?? ''); const [shared, setShared] = useState(original ? original.ownerUserProfileId === null : false); const [active, setActive] = useState(original?.isActive ?? true);
  const [saved, setSaved] = useState(false);
  const save = () => {
    if (!name.trim()) { mutation.setError('Give this account a name.'); return; }
    if (last4 && !/^\d{4}$/.test(last4)) { mutation.setError('Enter exactly four digits, or leave the last four blank.'); return; }
    const input: SaveFinancialAccount = { householdId: scope, name: name.trim(), accountType: type, institution: institution.trim() || null, last4: last4 || null,
      aliases: [...new Set(aliases.split(',').map(value => value.trim()).filter(Boolean))], shared, isActive: active };
    void mutation.execute(original ? 'Update financial account' : 'Add financial account', () => api.saveAccount(input, original?.id), () => setSaved(true));
  };
  return <Page title={original ? 'Manage account' : 'Add an account'} error={mutation.error}><OperationNotice refresh={mutation.refresh} />
    {route.params?.id && !original ? <ErrorNotice message="This account is no longer available in this household." /> : saved ? <Card><Text accessibilityLiveRegion="polite" style={styles.heading}>Account saved</Text><Button title="Done" onPress={() => navigation.goBack()} /></Card> : <>
      <Field label="Account name" value={name} onChangeText={setName} maxLength={128} editable={!mutation.blocked} />
      <ChoiceField label="Account type" value={type} options={choices(['BankAccount', 'CreditCard', 'Cash', 'Wallet'])} onChange={value => setType(value as FinancialAccount['accountType'])} disabled={mutation.blocked} />
      <Field label="Institution (optional)" value={institution} onChangeText={setInstitution} maxLength={128} editable={!mutation.blocked} />
      <Field label="Last four digits (optional)" value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} editable={!mutation.blocked} />
      <Field label="Aliases, separated by commas" value={aliases} onChangeText={setAliases} maxLength={1024} editable={!mutation.blocked} placeholder="salary account, daily card" />
      <Toggle label="Shared household account" value={shared} onChange={setShared} disabled={mutation.blocked || !!original} detail={original ? 'Sharing is fixed when the account is created.' : 'Use this for an account shared with household members.'} />
      <Toggle label="Account is active" value={active} onChange={setActive} disabled={mutation.blocked} detail="Inactive accounts stay in history and cannot be used for new entries." />
      <Button title="Save account" disabled={mutation.blocked} loading={mutation.busy} onPress={save} />
    </>}
  </Page>;
}
