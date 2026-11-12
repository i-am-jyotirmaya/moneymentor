import { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import type { FinancialAccount } from '../api/models';
import { useSession } from '../auth/session';
import { Button, ErrorBox, Field } from '../ui/AuthForm';
import { styles } from '../ui/theme';
import { accountPayload, accountValidation, emptyAccount } from './settings-data';
import { Action, Choice, Loading, Panel, ws } from './ui';

export function FinancialAccounts({ householdId, canWrite }: { householdId: string | null; canWrite: boolean }) {
  const { client } = useSession();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [form, setForm] = useState(() => emptyAccount(householdId));
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadedAttempt, setLoadedAttempt] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const loading = loadedAttempt !== attempt;
  useEffect(() => {
    let active = true;
    void client.accounts(householdId ?? undefined).then(rows => { if (active) setAccounts(rows); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load financial accounts.'); })
      .finally(() => { if (active) setLoadedAttempt(attempt); });
    return () => { active = false; };
  }, [client, householdId, attempt]);
  const disabled = !canWrite || saving;
  async function save() {
    if (!canWrite || lock.current) return;
    const invalid = accountValidation(form); if (invalid) { setError(invalid); return; }
    lock.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const account = await client.saveFinancialAccount(accountPayload(form, householdId), editing);
      setAccounts(rows => [...rows.filter(row => row.id !== account.id), account]);
      setForm(emptyAccount(householdId)); setEditing(undefined); setNotice('Financial account saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save financial account.'); }
    finally { lock.current = false; setSaving(false); }
  }
  return <Panel title="Financial accounts"><Text style={styles.text}>Accounts are optional. Add bank, credit card, cash or wallet accounts and names you use in chat.</Text>
    {loading ? <Loading label="Loading financial accounts" /> : accounts.map(account => <View key={account.id} style={ws.item}><Text style={styles.label}>{account.name}{account.last4 ? ` · ${account.last4}` : ''}</Text><Text style={ws.small}>{account.accountType} · {account.ownerUserProfileId ? 'Private' : 'Shared'}{!account.isActive ? ' · Archived' : ''}{account.aliases.length ? ` · ${account.aliases.join(', ')}` : ''}</Text><Action testID={`edit-account-${account.id}`} title={`Edit ${account.name}`} disabled={disabled} onPress={() => {
      setEditing(account.id); setNotice(''); setForm({ householdId, name: account.name, accountType: account.accountType, institution: account.institution, last4: account.last4, aliases: account.aliases, shared: account.ownerUserProfileId === null, isActive: account.isActive });
    }} /></View>)}
    {!loading && !accounts.length ? <Text style={styles.text}>You can keep tracking without adding an account.</Text> : null}
    <Field label="Account name" testID="account-name" maxLength={128} editable={!disabled} value={form.name} onChangeText={name => setForm({ ...form, name })} />
    <Choice label="Account type" value={form.accountType} disabled={disabled || !!editing} options={[{ value: 'BankAccount', label: 'Bank account' }, { value: 'CreditCard', label: 'Credit card' }, { value: 'Cash', label: 'Cash' }, { value: 'Wallet', label: 'Wallet' }]} onChange={v => setForm({ ...form, accountType: v as FinancialAccount['accountType'] })} />
    <Field label="Institution (optional)" maxLength={128} editable={!disabled} value={form.institution ?? ''} onChangeText={v => setForm({ ...form, institution: v || null })} />
    <Field label="Last four digits (optional)" maxLength={4} keyboardType="number-pad" editable={!disabled} value={form.last4 ?? ''} onChangeText={v => setForm({ ...form, last4: v || null })} />
    <Field label="Aliases (comma separated)" editable={!disabled} value={form.aliases.join(',')} onChangeText={v => setForm({ ...form, aliases: v.split(',') })} />
    <View style={ws.row}><Text style={styles.text}>Shared account (owner/admin)</Text><Switch accessibilityLabel="Shared account (owner/admin)" disabled={disabled || !!editing} value={form.shared} onValueChange={shared => setForm({ ...form, shared })} /></View>
    <View style={ws.row}><Text style={styles.text}>Active</Text><Switch accessibilityLabel="Active" disabled={disabled} value={form.isActive} onValueChange={isActive => setForm({ ...form, isActive })} /></View>
    <Button testID="save-account" title={saving ? 'Saving…' : editing ? 'Save account' : 'Add account'} disabled={disabled} onPress={() => void save()} />
    {editing ? <Action title="Cancel" onPress={() => { setEditing(undefined); setForm(emptyAccount(householdId)); }} /> : null}
    <ErrorBox message={error} />{error ? <Action title="Reload financial accounts" onPress={() => { setError(''); setAttempt(n => n + 1); }} /> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text> : null}
  </Panel>;
}
