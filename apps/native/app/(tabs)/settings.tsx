import { useSectionLoad, SectionPanel } from '../../src/workspace/sections';
import { useOffline } from '../../src/workspace/connection';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Badge, Card, ListRow, Segmented, useTheme } from '../../src/ui';
import type { ThemePreference } from '../../src/ui/ThemeProvider';
import { Linking, ScrollView, Share, Switch, Text, View } from 'react-native';
import type { UserSettings } from '../../src/api/models';
import { useSession } from '../../src/auth/session';
import { Button, Field } from '../../src/ui/AuthForm';
import { PrivacyPolicySheet } from '../../src/ui/PrivacyPolicySheet';

import { useWorkspace } from '../../src/workspace/context';
import { FinancialAccounts } from '../../src/workspace/financial-accounts';
import { reportingValidation } from '../../src/workspace/household-data';
import { canDeleteAccount, settingsPayload } from '../../src/workspace/settings-data';
import { Action, ErrorNotice, Loading, Panel } from '../../src/workspace/ui';
import { Choice } from '../../src/workspace/choice';
import { useLegacy } from '../../src/workspace/legacy-styles';
import { useDockSpace } from '../../src/workspace/dock';
import { useNavigationSounds } from '../../src/workspace/navigation-sounds';

export default function Settings() { const { styles, ws } = useLegacy(); const theme = useTheme(); const dock = useDockSpace();
  const { client, session } = useSession();
  const navigationSounds = useNavigationSounds();
  const offline = useOffline();
  const { householdId, households, retry } = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [privacyWorking, setPrivacyWorking] = useState(false);
  const section = useSectionLoad('settings', 'settings', () => client.settings());
  const [form, setForm] = useState<UserSettings | null>(section.data ?? null);
  const [loaded, setLoaded] = useState(section.data);
  if (section.data !== loaded) {
    setLoaded(section.data);
    if (section.data) setForm(section.data);
  }
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [policy, setPolicy] = useState(false);
  const saveLock = useRef(false);
  const privacyLock = useRef(false);
  const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@spndrr.example';
  async function save() {
    if (offline || !form || saveLock.current) return;
    const invalid = reportingValidation(form.currencyCode, form.timeZone);
    if (invalid) { setError(invalid); return; }
    saveLock.current = true; setSaving(true); setError('');
    try { const saved = await client.updateSettings(settingsPayload(form)); setForm(saved); section.setData(saved); retry(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save settings.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function privacy(action: 'export' | 'delete') {
    if (offline || privacyLock.current || (action === 'delete' && !canDeleteAccount(password, confirmation))) return;
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
  return <><ScrollView testID="settings-screen" keyboardShouldPersistTaps="handled" style={ws.fill} contentContainerStyle={[ws.content, { paddingBottom: dock + 24 }]}>
    <ErrorNotice error={error} retry={() => { setError(''); section.retry(); }} />
    <Text style={ws.small}>APPEARANCE</Text>
    <Card padding={0} testID="settings-appearance">
      <View style={{ padding: 16 }}><Segmented<ThemePreference> label="Appearance" value={theme.preference} onChange={theme.setPreference}
        options={[{ key: 'system', label: 'System' }, { key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} /></View>
    </Card>
    {navigationSounds.enabled !== null ? <Card padding={0}>
      <ListRow icon={{ android: 'volume_up', ios: 'speaker.wave.2' }} title="Navigation sounds"
        subtitle="Play a sound when switching screens" trailing="switch" value={navigationSounds.enabled}
        onPress={() => navigationSounds.setEnabled(!navigationSounds.enabled)} />
    </Card> : null}
    {navigationSounds.saveFailed ? <Text accessibilityRole="alert" style={styles.text}>Couldn’t save the sound preference. It applies until the app restarts.</Text> : null}
    <Text style={ws.small}>PRIVACY</Text>
    <Card padding={0}>
      <ListRow icon={{ android: 'download', ios: 'square.and.arrow.down' }} title="Export my data" trailing="chevron" onPress={() => void privacy('export')} />
      <ListRow icon={{ android: 'description', ios: 'doc.text' }} title="Privacy policy" trailing="chevron" onPress={() => setPolicy(true)} />
    </Card>
    {__DEV__ ? <><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={ws.small}>DEVELOPER</Text><Badge tone="dev" label="DEV BUILDS ONLY" /></View>
      <Card padding={0}><ListRow icon={{ android: 'terminal', ios: 'terminal' }} title="Developer menu" trailing="chevron" onPress={openDevMenu} />
        <ListRow icon={{ android: 'dns', ios: 'server.rack' }} title="API server" value={process.env.EXPO_PUBLIC_API_BASE_URL ?? 'default'} /></Card></> : null}
    {!form ? (section.blocked || section.loading ? <SectionPanel section={section} /> : <Loading label="Loading settings" />) : <>
      <Panel title="Settings"><Text style={styles.text}>Personalize your tracking preferences.</Text>
        <Field label="Default currency" testID="settings-currency" maxLength={3} value={form.currencyCode} onChangeText={currencyCode => setForm({ ...form, currencyCode: currencyCode.toUpperCase() })} />
        <Field label="Time zone" value={form.timeZone} autoCapitalize="none" onChangeText={timeZone => setForm({ ...form, timeZone })} />
        <Field label="Plan" testID="settings-plan" editable={false} value={form.plan} /><Text style={ws.small}>Entitlements are server-controlled. Contact support for beta access changes.</Text>
        <Choice label="Default visibility" value={form.defaultTransactionVisibility} options={['Private', 'Household'].map(value => ({ value, label: value }))} onChange={v => setForm({ ...form, defaultTransactionVisibility: v as 'Private' | 'Household' })} />
      </Panel>
      <Panel title="Capture preferences"><View style={ws.row}><Text style={styles.label}>Require merchant for expenses</Text><Switch style={{ minWidth: 48, minHeight: 48 }} testID="require-merchant" accessibilityLabel="Require merchant for expenses" value={form.requireMerchantForExpenses} onValueChange={requireMerchantForExpenses => setForm({ ...form, requireMerchantForExpenses })} /></View><Text style={styles.text}>Ask a follow-up when an expense does not include a merchant.</Text><Button write testID="save-settings" title={saving ? 'Saving...' : 'Save settings'} disabled={saving} onPress={() => void save()} /></Panel>
      <Panel title="Your privacy data"><Text style={styles.text}>Download a versioned JSON copy of your profile, consent history, memberships, invitations, transactions including trash, and other user-owned records.</Text><Action write testID="export-data" title="Export my data" disabled={privacyWorking} onPress={() => void privacy('export')} /><Text style={styles.text}>Support: {supportEmail}</Text><Action title={supportEmail} onPress={() => { void Linking.openURL(`mailto:${supportEmail}`).catch(() => setError('Could not open your email app.')); }} /><Action title="Read the beta privacy policy" onPress={() => setPolicy(true)} /></Panel>
      <Panel title="Delete account"><Text style={styles.text}>This deletes private data and anonymizes eligible shared household records. Enter your password and type DELETE.</Text><Field label="Current password" testID="deletion-password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" /><Field label="Confirmation" testID="deletion-confirmation" placeholder="DELETE" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" /><Button write testID="delete-account" title="Delete my account" disabled={privacyWorking || !canDeleteAccount(password, confirmation)} onPress={() => void privacy('delete')} /></Panel>
      <FinancialAccounts key={householdId ?? 'personal'} householdId={householdId} canWrite={households?.households.find(h => h.id === householdId)?.canWrite ?? false} />
    </>}
    <Panel title="Account"><Text style={styles.text}>{session?.user.displayName}</Text><Text style={styles.text}>{session?.user.email}</Text><Button testID="settings-sign-out" title="Sign out" disabled={busy} onPress={() => {
      setBusy(true);
      void client.logout().catch(() => undefined).finally(() => { router.replace('/(auth)/login'); setBusy(false); });
    }} /></Panel>
  </ScrollView><PrivacyPolicySheet visible={policy} onClose={() => setPolicy(false)} /></>;
}

function openDevMenu() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dev-only native module, absent from release bundles
  try { (require('expo-dev-client') as { openMenu(): void }).openMenu(); } catch { /* not a dev client */ }
}
