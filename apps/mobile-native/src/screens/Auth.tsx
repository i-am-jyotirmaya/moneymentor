import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FinanceClient } from '@spndrr/finance-core';
import { Button, Card, ErrorNotice, Field, styles } from '../ui/primitives';

export function LoginScreen({ client, unavailable, onRestore }: { client: FinanceClient; unavailable: boolean; onRestore: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const login = () => { void (async () => {
    if (active.current || !email.trim() || !password) return;
    active.current = true; setBusy(true); setError(null);
    try { await client.login(email, password); setPassword(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign in.'); }
    finally { active.current = false; setBusy(false); }
  })(); };
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>spndrr.</Text><Text accessibilityRole="header" style={styles.title}>{'Make room for\nwhat matters.'}</Text>
      <Text style={styles.body}>Sign in to your Spndrr account.</Text>
      {unavailable ? <ErrorNotice message="Your saved session could not be checked. Try again when your connection returns, or sign in below." onRetry={onRestore} /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
        autoComplete="email" textContentType="username" returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} editable={!busy} />
      <Field ref={passwordInput} label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password"
        returnKeyType="go" onSubmitEditing={login} editable={!busy} />
      <Button title="Sign in" onPress={login} loading={busy} disabled={!email.trim() || !password} />
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
