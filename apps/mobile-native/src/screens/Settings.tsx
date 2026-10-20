import { useRef, useState } from 'react';
import { Alert, Linking, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { Visibility } from '@spndrr/finance-core';
import { useEntry } from '../state/entry';
import { useWorkspace, useWorkspaceMutation } from '../state/workspace';
import { OperationNotice } from '../state/operations';
import { clearExportCache, sharePrivacyExport } from '../services/share-export';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';
import { ChoiceField, Page, Toggle } from '../ui/forms';
import { choices } from '../ui/workspace';

export function SettingsScreen() {
  const entry = useEntry(); const { api, settings } = useWorkspace(); const mutation = useWorkspaceMutation({ allowReadOnly: true });
  const [currency, setCurrency] = useState(settings.currencyCode); const [zone, setZone] = useState(settings.timeZone);
  const [visibility, setVisibility] = useState<Visibility>(entry.resources.settings.defaultTransactionVisibility); const [requireMerchant, setRequireMerchant] = useState(entry.resources.settings.requireMerchantForExpenses);
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false); const exportBusy = useRef(false); const [exportError, setExportError] = useState<string | null>(null);
  const policy = useQuery({ queryKey: ['privacy-policy'], queryFn: () => entry.client.privacyPolicy(), staleTime: 300000 });
  const save = () => {
    try { if (!/^[A-Z]{3}$/.test(currency)) throw Error(); new Intl.DateTimeFormat('en', { timeZone: zone }).format(); }
    catch { mutation.setError('Enter a three-letter currency code and a valid time zone.'); return; }
    void mutation.execute('Update personal settings', () => api.updateSettings({ currencyCode: currency, timeZone: zone, defaultTransactionVisibility: visibility, requireMerchantForExpenses: requireMerchant }), () => setMessage('Your preferences were saved.'));
  };
  const exportData = () => { if (exportBusy.current) return; exportBusy.current = true; setExporting(true); setExportError(null);
    void sharePrivacyExport(() => api.exportData()).then(() => setMessage('Export opened in the system share sheet. The temporary copy can be removed below.')).catch(caught => setExportError(caught instanceof Error ? caught.message : 'Your export could not be prepared.')).finally(() => { exportBusy.current = false; setExporting(false); });
  };
  const removeAccount = () => {
    if (confirmation !== 'DELETE' || !password) return;
    Alert.alert('Permanently delete your account?', 'This deletes your private data and anonymizes eligible shared records. This cannot be undone.', [
      { text: 'Keep account', style: 'cancel' }, { text: 'Delete my account', style: 'destructive', onPress: () => { void mutation.execute('Delete user account', () => api.deleteAccount(password), async () => {
        setPassword('');
        const cleanup = entry.clearForLogout(true);
        await Promise.allSettled([cleanup, entry.client.logout(), Promise.resolve().then(clearExportCache)]);
      }); } },
    ]);
  };
  return <Page title="Make it yours" error={mutation.error} onRefresh={() => { void mutation.refresh(); }}>
    <OperationNotice refresh={mutation.refresh} />
    <Card><Text style={styles.heading}>{entry.resources.settings.displayName}</Text><Text style={styles.caption}>{entry.resources.settings.email} · {entry.resources.settings.plan}</Text>
      <Text style={styles.caption}>Your plan is controlled by Spndrr. Household currency and time zone are managed in Households.</Text>
    </Card>
    <Field label="Default currency" value={currency} onChangeText={value => setCurrency(value.toUpperCase())} maxLength={3} autoCapitalize="characters" editable={!mutation.blocked} />
    <Field label="Time zone" value={zone} onChangeText={setZone} autoCapitalize="none" autoCorrect={false} maxLength={100} editable={!mutation.blocked} />
    <ChoiceField label="Default transaction visibility" value={visibility} options={choices(['Private', 'Household'])} onChange={value => setVisibility(value as Visibility)} disabled={mutation.blocked} />
    <Toggle label="Require merchant for expenses" value={requireMerchant} onChange={setRequireMerchant} disabled={mutation.blocked} detail="Ask for a merchant when an expense does not include one." />
    <Button title="Save preferences" disabled={mutation.blocked} loading={mutation.busy} onPress={save} />
    {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
    <Card><Text style={styles.heading}>Your privacy data</Text><Text style={styles.body}>Export a JSON copy of your profile, consent history, memberships, invitations and user-owned records, including transaction trash. Choose a trusted destination in the system share sheet.</Text>
      <Button title="Export my data" secondary disabled={exporting || mutation.busy} loading={exporting} onPress={exportData} />
      <Button title="Remove temporary export" secondary disabled={exporting} onPress={() => { try { clearExportCache(); setMessage('Temporary export removed from this device.'); } catch { setExportError('The temporary file could not be removed. Try again.'); } }} />
      {exportError ? <ErrorNotice message={exportError} /> : null}
      {policy.data ? <><Text style={styles.caption}>Privacy policy {policy.data.version} · Effective {policy.data.effectiveDate}</Text>
        <Button title="Read privacy policy" secondary onPress={() => { void Linking.openURL(policy.data!.policyUrl).catch(() => setExportError('The policy link could not be opened.')); }} />
        <Text style={styles.caption}>Support: {policy.data.supportEmail}</Text></> : policy.isError ? <ErrorNotice message="The current privacy policy could not be loaded." onRetry={() => { void policy.refetch(); }} /> : null}
    </Card>
    <Card><Text style={styles.heading}>Delete account</Text><Text style={styles.body}>Permanently delete private data and anonymize eligible shared household records. Enter your current password and type DELETE.</Text>
      <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoCapitalize="none" autoCorrect={false} editable={!mutation.blocked} />
      <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} maxLength={6} editable={!mutation.blocked} />
      <Button title="Delete my account" secondary disabled={mutation.blocked || confirmation !== 'DELETE' || !password || exporting} onPress={removeAccount} />
    </Card>
  </Page>;
}
