import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, type FinanceClient } from '@spndrr/finance-core';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';
import { clearExportCache, sharePrivacyExport } from '../services/share-export';

export function LoginScreen({ client, unavailable, onRestore }: { client: FinanceClient; unavailable: boolean; onRestore: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'access'>('login');
  const [invitation, setInvitation] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  useEffect(() => {
    const receive = (url: string | null) => {
      if (!url) return;
      try { const link = new URL(url); if (link.protocol === 'spndrr-native:' && (link.hostname === 'signup' || link.pathname === '/signup')) {
        setInvitation(link.searchParams.get('token') ?? ''); setMode('signup');
      } } catch { /* Ignore unrelated/malformed links. Never log invitation tokens. */ }
    };
    void Linking.getInitialURL().then(receive).catch(() => undefined);
    const listener = Linking.addEventListener('url', event => receive(event.url));
    return () => listener.remove();
  }, []);
  const login = () => { void (async () => {
    if (active.current || !email.trim() || !password) return;
    active.current = true; setBusy(true); setError(null);
    try { await client.login(email, password); setPassword(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign in.'); }
    finally { active.current = false; setBusy(false); }
  })(); };
  if (mode !== 'login') return <RegistrationScreen key={mode} client={client} mode={mode} invitation={invitation} onBack={() => setMode('login')} onRequestAccess={() => setMode('access')} />;
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>spndrr.</Text><Text accessibilityRole="header" style={styles.title}>{'Make room for\nwhat matters.'}</Text>
      <Text style={styles.body}>Sign in to your Spndrr account.</Text>
      {unavailable ? <ErrorNotice message="Your saved session could not be checked. Try again when your connection returns, or sign in below." onRetry={onRestore} /> : null}
      <Field label="Email" testID="email-input" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        autoComplete="email" textContentType="username" returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} editable={!busy} />
      <Field ref={passwordInput} label="Password" testID="password-input" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password"
        returnKeyType="go" onSubmitEditing={login} editable={!busy} />
      <Button title="Sign in" onPress={login} loading={busy} disabled={!email.trim() || !password} />
      {error ? <ErrorNotice message={error} /> : null}
      <Button title="Create an account" secondary onPress={() => setMode('signup')} disabled={busy} />
      <Button title="Request beta access" secondary onPress={() => setMode('access')} disabled={busy} />
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function RegistrationScreen({ client, mode, invitation, onBack, onRequestAccess }: {
  client: FinanceClient; mode: 'signup' | 'access'; invitation: string; onBack: () => void; onRequestAccess: () => void;
}) {
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); const [reason, setReason] = useState('');
  const [token, setToken] = useState(invitation); const [accepted, setAccepted] = useState(false);
  const [open, setOpen] = useState(false); const [policy, setPolicy] = useState<Awaited<ReturnType<FinanceClient['privacyPolicy']>> | null>(null);
  const [ready, setReady] = useState(mode === 'access'); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); const [unknown, setUnknown] = useState(false); const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  useEffect(() => {
    if (mode === 'access') return;
    let alive = true;
    void Promise.all([client.registration(), client.privacyPolicy()]).then(([registration, current]) => {
      if (alive) { setOpen(registration.mode === 'Open'); setPolicy(current); setReady(true); }
    }).catch(() => { if (alive) setError('Registration details could not be loaded. Return to sign in and try again.'); });
    return () => { alive = false; };
  }, [client, mode]);
  const validate = () => { if (active.current || !token.trim()) return; active.current = true; setBusy(true); setError(null);
    void client.validateInvitation(token.trim()).then(value => { setEmail(value.email); setName(value.name); })
      .catch(caught => setError(caught instanceof Error ? caught.message : 'This invitation could not be checked.'))
      .finally(() => { active.current = false; setBusy(false); }); };
  const submit = () => { if (active.current || unknown || !ready || !name.trim() || !email.trim()) return;
    if (mode === 'signup' && (!accepted || !policy || password.length < 8 || (!open && !token.trim()))) return;
    active.current = true; setBusy(true); setError(null);
    void (mode === 'access' ? client.requestAccess({ name: name.trim(), email: email.trim(), reason: reason.trim() || undefined })
      : client.signup({ displayName: name.trim(), email: email.trim(), password, acceptPrivacyPolicy: accepted,
        privacyPolicyVersion: policy!.version, invitationToken: token.trim() || undefined }))
      .then(() => { setPassword(''); setDone(true); })
      .catch(caught => { setError(caught instanceof Error ? caught.message : 'The request could not be confirmed.');
        if (!(caught instanceof ApiError) || caught.outcome === 'unknown') setUnknown(true); })
      .finally(() => { active.current = false; setBusy(false); });
  };
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button title="Back to sign in" secondary onPress={onBack} disabled={busy} />
      <Text accessibilityRole="header" style={styles.title}>{mode === 'access' ? 'A little more clarity.' : 'Welcome to Spndrr.'}</Text>
      {done ? <Card><Text style={styles.body}>Your request has been received. We’ll email you if access is approved.</Text></Card> : <>
        {mode === 'signup' && !open ? <><Text style={styles.body}>Spndrr beta uses signup invitations.</Text>
          <Field label="Signup invitation token" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} editable={!busy && !unknown} />
          <Button title="Check invitation" secondary onPress={validate} loading={busy} disabled={!ready || !token.trim() || unknown} />
          <Button title="Request an invitation" secondary onPress={onRequestAccess} disabled={busy} /></> : null}
        <Field label="Your name" value={name} onChangeText={setName} maxLength={128} autoComplete="name" editable={!busy && !unknown} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy && !unknown} />
        {mode === 'access' ? <Field label="What would you like help with? (optional)" value={reason} onChangeText={setReason} maxLength={1000} multiline editable={!busy && !unknown} /> : <>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" editable={!busy && !unknown} />
          <Text style={styles.caption}>Use at least 8 characters. The server applies the account password rules.</Text>
          {policy ? <Button title="Read current privacy policy" secondary onPress={() => { if (policy.policyUrl.startsWith('https://')) void Linking.openURL(policy.policyUrl).catch(() => setError('The privacy policy could not be opened.')); }} /> : null}
          <View style={styles.row}><Switch accessibilityLabel="I accept the current privacy policy" value={accepted} onValueChange={setAccepted} disabled={busy || unknown} /><Text style={styles.body}>I accept the current privacy policy.</Text></View>
        </>}
        <Button title={mode === 'access' ? 'Request access' : 'Create account'} onPress={submit} loading={busy}
          disabled={!ready || unknown || !name.trim() || !email.trim() || (mode === 'signup' && (!accepted || password.length < 8 || (!open && !token.trim())))} />
      </>}
      {unknown ? <Text accessibilityRole="alert" style={styles.body}>{mode === 'access' ? 'Your request may already have arrived. Check your email before requesting again.' : 'Your account may already exist. Return to sign in before creating another account.'}</Text> : null}
      {error ? <ErrorNotice message={error} /> : null}
    </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

export function PrivacyScreen({ client, onLogout, onDeleted = onLogout }: { client: FinanceClient; onLogout: () => void; onDeleted?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [dataBusy, setDataBusy] = useState(false); const [deletionUncertain, setDeletionUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Awaited<ReturnType<FinanceClient['privacyPolicy']>> | null>(null);
  const alive = useRef(true); const loading = useRef(false);
  const load = useCallback(() => {
    if (loading.current) return; loading.current = true;
    void client.privacyPolicy().then(value => { if (alive.current) { setPolicy(value); setError(null); } })
      .catch(() => { if (alive.current) setError('The current privacy policy could not be loaded. Retry before accepting.'); })
      .finally(() => { loading.current = false; });
  }, [client]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  const accept = () => { if (busy || dataBusy || deletionUncertain || !policy) return; setBusy(true); void client.acceptPrivacy(policy.version)
    .then(() => client.refresh()).catch(() => setError('Your consent could not be confirmed. Please try again.')).finally(() => setBusy(false)); };
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Your money is personal.</Text>
    <Text style={styles.caption}>{policy ? `Spndrr privacy policy · ${policy.version} · Effective ${policy.effectiveDate}` : 'Loading the current privacy policy…'}</Text>
    {policy ? <Button title="Read current privacy policy" secondary onPress={() => { void Linking.openURL(policy.policyUrl).catch(() => setError('The privacy policy could not be opened. Please try again.')); }} /> : null}
    <Card><Text style={styles.heading}>What Spndrr stores</Text><Text style={styles.body}>Your account profile, settings, household memberships and invitations, assistant messages, and the financial records you choose to capture.</Text></Card>
    <Card><Text style={styles.heading}>How your data is used</Text><Text style={styles.body}>To run Spndrr, calculate reports from stored data, deliver invitations, secure sessions, and diagnose reliability problems. AI can help interpret messages; it is not the source of truth for financial totals.</Text></Card>
    <Card><Text style={styles.heading}>AI goal planning</Text><Text style={styles.body}>When you request an AI goal plan, a minimized summary of calculated totals and planning constraints is sent to the configured model provider, without transaction descriptions, merchant names, account identity, email, or raw transaction history. Shared goals use another member’s private aggregates only after their consent for that goal. They can revoke consent for future runs.</Text></Card>
    <Card><Text style={styles.heading}>Visibility and your controls</Text><Text style={styles.body}>Private transactions are visible only to you. Household-visible transactions can be read by active members; viewers cannot change financial records. Spndrr supports data export, a 30-day transaction trash period, and account deletion. Shared household records may remain anonymized to preserve accurate totals.</Text></Card>
    <Text style={styles.caption}>This screen is a summary. Read the current policy before accepting. This device stores refresh credentials and unsent drafts securely.</Text>
    {error ? <ErrorNotice message={error} onRetry={load} /> : null}
    <Button title="Accept privacy policy" loading={busy} disabled={!policy || dataBusy || deletionUncertain} onPress={accept} />
    <Button title="Sign out" secondary disabled={busy || dataBusy} onPress={onLogout} />
    <PrivacyDataOptions client={client} onDeleted={onDeleted} consentBusy={busy} onBusyChange={setDataBusy} onDeletionUncertain={() => setDeletionUncertain(true)} />
  </ScrollView></SafeAreaView>;
}

function PrivacyDataOptions({ client, onDeleted, consentBusy, onBusyChange, onDeletionUncertain }: { client: FinanceClient; onDeleted: () => void; consentBusy: boolean; onBusyChange: (busy: boolean) => void; onDeletionUncertain: () => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const active = useRef(false);
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportData = () => { if (active.current || consentBusy) return; active.current = true; setBusy(true); onBusyChange(true); setError(null);
    void sharePrivacyExport(() => client.request<unknown>('/api/privacy/export'))
      .catch(caught => setError(caught instanceof Error ? caught.message : 'Your export could not be prepared.')).finally(() => { active.current = false; setBusy(false); onBusyChange(false); });
  };
  const remove = () => Alert.alert('Permanently delete your account?', 'This deletes private data and anonymizes eligible shared records. This cannot be undone.', [
    { text: 'Keep account', style: 'cancel' }, { text: 'Delete my account', style: 'destructive', onPress: () => {
      if (active.current || consentBusy || uncertain || !password || confirmation !== 'DELETE') return; active.current = true; setBusy(true); onBusyChange(true); setError(null);
      void client.request<void>('/api/privacy/account', 'DELETE', { password, confirmation: 'DELETE' }).then(() => { setPassword(''); onDeleted(); })
        .catch(caught => { if (!(caught instanceof ApiError) || caught.outcome === 'unknown') { setUncertain(true); onDeletionUncertain(); } setError(caught instanceof Error ? caught.message : 'Deletion could not be confirmed.'); })
        .finally(() => { active.current = false; setBusy(false); onBusyChange(false); });
    } },
  ]);
  return <Card><Text style={styles.heading}>Your data remains yours</Text><Text style={styles.caption}>You can export or delete your account without accepting the updated policy.</Text>
    <Button title="Privacy data options" secondary disabled={consentBusy || busy} onPress={() => setOpen(value => !value)} />
    {open ? <><Button title="Export my data without accepting" secondary disabled={consentBusy || busy} loading={busy} onPress={exportData} />
      <Text style={styles.caption}>Choose a trusted destination for the JSON export in the native share sheet.</Text>
      <Button title="Remove temporary export" secondary disabled={busy} onPress={() => { try { clearExportCache(); } catch { setError('The temporary export could not be removed.'); } }} />
      <Field label="Password to delete account" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy && !uncertain} />
      <Field label="Type DELETE to confirm account deletion" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" maxLength={6} editable={!busy && !uncertain} />
      <Button title="Delete account without accepting" secondary disabled={busy || consentBusy || uncertain || !password || confirmation !== 'DELETE'} onPress={remove} />
      {uncertain ? <Text style={styles.caption}>Deletion may already have completed. Sign out and check whether the account still exists before trying again.</Text> : null}
    </> : null}
    {error ? <ErrorNotice message={error} /> : null}
  </Card>;
}
