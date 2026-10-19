import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, type FinanceClient } from '@spndrr/finance-core';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';

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
  if (mode !== 'login') return <RegistrationScreen client={client} mode={mode} invitation={invitation} onBack={() => setMode('login')} onRequestAccess={() => setMode('access')} />;
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
    if (mode === 'access') { setReady(true); return; }
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

export function PrivacyScreen({ client, onLogout }: { client: FinanceClient; onLogout: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = () => { if (busy) return; setBusy(true); void client.acceptPrivacy('2026-07-26-ai-planning.1')
    .then(() => client.refresh()).catch(() => setError('Your consent could not be confirmed. Please try again.')).finally(() => setBusy(false)); };
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Your money is personal.</Text>
    <Text style={styles.caption}>Spndrr beta privacy policy · 2026-07-26-ai-planning.1</Text>
    <Card><Text style={styles.heading}>What Spndrr stores</Text><Text style={styles.body}>Your account profile, settings, household memberships and invitations, assistant messages, and the financial records you choose to capture.</Text></Card>
    <Card><Text style={styles.heading}>How your data is used</Text><Text style={styles.body}>To run Spndrr, calculate reports from stored data, deliver invitations, secure sessions, and diagnose reliability problems. AI can help interpret messages; it is not the source of truth for financial totals.</Text></Card>
    <Card><Text style={styles.heading}>AI goal planning</Text><Text style={styles.body}>When you request an AI goal plan, a minimized summary of calculated totals and planning constraints is sent to the configured model provider, without transaction descriptions, merchant names, account identity, email, or raw transaction history. Shared goals use another member’s private aggregates only after their consent for that goal. They can revoke consent for future runs.</Text></Card>
    <Card><Text style={styles.heading}>Visibility and your controls</Text><Text style={styles.body}>Private transactions are visible only to you. Household-visible transactions can be read by active members; viewers cannot change financial records. Spndrr supports data export, a 30-day transaction trash period, and account deletion. Shared household records may remain anonymized to preserve accurate totals.</Text></Card>
    <Text style={styles.caption}>This beta policy is a product draft pending legal review before general availability. This device stores refresh credentials and unsent drafts securely.</Text>
    {error ? <ErrorNotice message={error} /> : null}
    <Button title="Accept privacy policy" loading={busy} onPress={accept} />
    <Button title="Sign out" secondary disabled={busy} onPress={onLogout} />
  </ScrollView></SafeAreaView>;
}
