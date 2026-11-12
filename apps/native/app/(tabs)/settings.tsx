import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Share, Switch, Text, View } from 'react-native';
import type { UserSettings } from '../../src/api/models';
import { useSession } from '../../src/auth/session';
import { Button, ErrorBox, Field } from '../../src/ui/AuthForm';
import { PrivacyPolicySheet } from '../../src/ui/PrivacyPolicySheet';
import { styles } from '../../src/ui/theme';
import { useWorkspace } from '../../src/workspace/context';
import { FinancialAccounts } from '../../src/workspace/financial-accounts';
import { reportingValidation } from '../../src/workspace/household-data';
import { canDeleteAccount, settingsPayload } from '../../src/workspace/settings-data';
import { Action, Choice, Loading, Panel, ws } from '../../src/workspace/ui';

export default function Settings() {
  const { client, session } = useSession();
  const { householdId, households, retry } = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [privacyWorking, setPrivacyWorking] = useState(false);
  const [form, setForm] = useState<UserSettings | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [policy, setPolicy] = useState(false);
  const saveLock = useRef(false);
  const privacyLock = useRef(false);
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@spndrr.example';
  useEffect(() => {
    let active = true;
    void client.settings().then(value => { if (active) setForm(value); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load settings.'); });
    return () => { active = false; };
  }, [client, attempt]);
  async function save() {
    if (!form || saveLock.current) return;
    const invalid = reportingValidation(form.currencyCode, form.timeZone);
    if (invalid) { setError(invalid); return; }
    saveLock.current = true; setSaving(true); setError('');
    try { setForm(await client.updateSettings(settingsPayload(form))); retry(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function privacy(action: 'export' | 'delete') {
    if (privacyLock.current || (action === 'delete' && !canDeleteAccount(password, confirmation))) return;
    privacyLock.current = true; setPrivacyWorking(true); setError('');
    try {
      if (action === 'export') {
        const data = await client.exportPrivacy();
        await Share.share({ title: 'spndrr-export.json', message: JSON.stringify(data, null, 2) });
      } else {
        await client.deleteAccount({ password, confirmation });
        router.replace('/(auth)/login');
      }
    } catch (e) { setError(e instanceof Error ? e.message : action === 'export' ? 'Could not export your data.' : 'Could not delete your account.'); }
    finally { privacyLock.current = false; setPrivacyWorking(false); }
  }
  return <><ScrollView testID="settings-screen" keyboardShouldPersistTaps="handled" contentContainerStyle={ws.content}>
    <ErrorBox message={error} />{error ? <Action title="Reload settings" onPress={() => { setError(''); setAttempt(n => n + 1); }} /> : null}
    {!form ? <Loading label="Loading settings" /> : <>
      <Panel title="Settings"><Text style={styles.text}>Personalize your tracking preferences.</Text>
        <Field label="Default currency" testID="settings-currency" maxLength={3} value={form.currencyCode} onChangeText={currencyCode => setForm({ ...form, currencyCode: currencyCode.toUpperCase() })} />
        <Field label="Time zone" value={form.timeZone} autoCapitalize="none" onChangeText={timeZone => setForm({ ...form, timeZone })} />
        <Field label="Plan" testID="settings-plan" editable={false} value={form.plan} /><Text style={ws.small}>Entitlements are server-controlled. Contact support for beta access changes.</Text>
        <Choice label="Default visibility" value={form.defaultTransactionVisibility} options={['Private', 'Household'].map(value => ({ value, label: value }))} onChange={v => setForm({ ...form, defaultTransactionVisibility: v as 'Private' | 'Household' })} />
      </Panel>
      <Panel title="Capture preferences"><View style={ws.row}><Text style={styles.label}>Require merchant for expenses</Text><Switch testID="require-merchant" accessibilityLabel="Require merchant for expenses" value={form.requireMerchantForExpenses} onValueChange={requireMerchantForExpenses => setForm({ ...form, requireMerchantForExpenses })} /></View><Text style={styles.text}>Ask a follow-up when an expense does not include a merchant.</Text><Button testID="save-settings" title={saving ? 'Saving...' : 'Save settings'} disabled={saving} onPress={() => void save()} /></Panel>
      <Panel title="Your privacy data"><Text style={styles.text}>Download a versioned JSON copy of your profile, consent history, memberships, invitations, transactions including trash, and other user-owned records.</Text><Action testID="export-data" title="Export my data" disabled={privacyWorking} onPress={() => void privacy('export')} /><Text style={styles.text}>Support: {supportEmail}</Text><Action title={supportEmail} onPress={() => { void Linking.openURL(`mailto:${supportEmail}`).catch(() => setError('Could not open your email app.')); }} /><Action title="Read the beta privacy policy" onPress={() => setPolicy(true)} /></Panel>
      <Panel title="Delete account"><Text style={styles.text}>This deletes private data and anonymizes eligible shared household records. Enter your password and type DELETE.</Text><Field label="Current password" testID="deletion-password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" /><Field label="Confirmation" testID="deletion-confirmation" placeholder="DELETE" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" /><Button testID="delete-account" title="Delete my account" disabled={privacyWorking || !canDeleteAccount(password, confirmation)} onPress={() => void privacy('delete')} /></Panel>
      <FinancialAccounts key={householdId ?? 'personal'} householdId={householdId} canWrite={households?.households.find(h => h.id === householdId)?.canWrite ?? false} />
    </>}
    <Panel title="Account"><Text style={styles.text}>{session?.user.displayName}</Text><Text style={styles.text}>{session?.user.email}</Text><Button title="Sign out" disabled={busy} onPress={() => {
      setBusy(true);
      void client.logout().catch(() => undefined).finally(() => { router.replace('/(auth)/login'); setBusy(false); });
    }} /></Panel>
  </ScrollView><PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} /></>;
}
