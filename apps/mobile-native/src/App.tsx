import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider, focusManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { dateInTimeZone, type AuthSession, type EntryResources } from '@spndrr/finance-core';
import { createRuntime, type Runtime } from './services/runtime';
import type { SecureJsonStore } from './services/secure-json';
import { EntryProvider } from './state/entry';
import { OperationsProvider } from './state/operations';
import { Button, ErrorNotice, KeyboardDismissButton, Loading, styles, useReducedMotion } from './ui/primitives';
import { color } from './ui/theme';
import { LoginScreen, PrivacyScreen } from './screens/Auth';
import { ComposerScreen } from './screens/Composer';
import { HomeScreen } from './screens/Home';
import { PickerScreen } from './screens/Picker';
import { EditScreen } from './screens/Edit';
import { AddAccountScreen } from './screens/AddAccount';
import type { Routes } from './navigation';

const Stack = createNativeStackNavigator<Routes>();
const navigationTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: color.ink, background: color.background, card: color.background, text: color.ink, border: color.border } };

function Workspace({ runtime, session }: { runtime: Runtime; session: AuthSession }) {
  const reduced = useReducedMotion();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const query = useQuery({ queryKey: ['entry', session.user.id], queryFn: async () => {
    const [catalog, accounts, settings] = await Promise.all([runtime.client.categories(), runtime.client.accounts(), runtime.client.settings()]);
    return { catalog, accounts, settings };
  }, staleTime: 60000, retry: 1 });
  const [vault, setVault] = useState<SecureJsonStore | null>(null);
  const [operationVault, setOperationVault] = useState<SecureJsonStore | null>(null);
  const [vaultError, setVaultError] = useState(false);
  const [vaultAttempt, setVaultAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([runtime.draftVault(session.user.id), runtime.operationVault(session.user.id)]).then(([draft, operations]) => {
      if (alive) { setVault(draft); setOperationVault(operations); }
    }).catch(() => { if (alive) setVaultError(true); });
    return () => { alive = false; };
  }, [runtime, session.user.id, vaultAttempt]);
  const resources = useMemo<EntryResources | null>(() => query.data ? ({ categories: query.data.catalog.categories, accounts: query.data.accounts,
    settings: query.data.settings, householdId: query.data.catalog.householdId, canWrite: query.data.catalog.canWrite,
    today: dateInTimeZone(query.data.settings.timeZone, new Date(clock)) }) : null, [query.data, clock]);
  if ((query.isError && !query.data) || vaultError) return <View style={styles.center}><ErrorNotice message={vaultError ? 'Secure device storage is unavailable.' : 'Your categories and accounts could not be loaded.'} onRetry={() => { setVaultError(false); setVaultAttempt(previous => previous + 1); void query.refetch(); }} />
    <Button title="Sign out" secondary onPress={() => { void runtime.client.logout().catch(() => undefined); }} /></View>;
  if (!resources || !vault || !operationVault) return <Loading />;
  return <OperationsProvider key={session.user.id} ownerId={session.user.id} vault={operationVault}><EntryProvider ownerId={session.user.id} client={runtime.client} resources={resources} vault={vault}>
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: color.background }, headerStyle: { backgroundColor: color.background }, headerTintColor: color.ink,
        headerShadowVisible: false, headerRight: () => <KeyboardDismissButton />, animation: reduced ? 'none' : 'default', gestureEnabled: true }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Composer" component={ComposerScreen} options={({ navigation }) => ({ title: 'Add transaction', presentation: 'modal', animation: reduced ? 'none' : 'slide_from_bottom',
          headerLeft: () => <Button title="Close" accessibilityLabel="Close transaction composer" testID="composer-close" secondary onPress={() => navigation.goBack()} /> })} />
        <Stack.Screen name="Picker" component={PickerScreen} options={{ title: 'Choose', presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
        <Stack.Screen name="Edit" component={EditScreen} options={{ title: 'Edit transaction' }} />
        <Stack.Screen name="AddAccount" component={AddAccountScreen} options={{ title: 'Add account' }} />
      </Stack.Navigator>
    </NavigationContainer>
  </EntryProvider></OperationsProvider>;
}

function SessionGate({ runtime }: { runtime: Runtime }) {
  const state = useSyncExternalStore(runtime.client.subscribe, runtime.client.getSnapshot);
  const query = useQueryClient();
  const [restored, setRestored] = useState(false);
  const restore = () => { setRestored(false); void runtime.client.restore().catch(() => undefined).finally(() => setRestored(true)); };
  useEffect(() => { void runtime.client.restore().catch(() => undefined).finally(() => setRestored(true)); }, [runtime]);
  useEffect(() => {
    if (!state.session) query.clear();
  }, [state.session, query]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      focusManager.setFocused(next === 'active');
      if (next === 'active' && runtime.client.getSnapshot().session) void runtime.client.refresh().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [runtime]);
  if (!restored || state.status === 'loading') return <Loading label="Checking your session…" />;
  if (!state.session) return <LoginScreen client={runtime.client} unavailable={state.status === 'unavailable'} onRestore={restore} />;
  if (state.session.requiresPrivacyConsent) return <PrivacyScreen client={runtime.client} onLogout={() => {
    void runtime.draftVault(state.session!.user.id).then(vault => vault.closeAndRemove()).finally(() => runtime.client.logout()).catch(() => undefined);
  }} />;
  return <Workspace key={state.session.user.id} runtime={runtime} session={state.session} />;
}

export default function App() {
  const [query] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, gcTime: 300000 }, mutations: { retry: false } } }));
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void createRuntime().then(setRuntime).catch(caught => setError(caught instanceof Error ? caught.message : 'Secure native setup failed.'));
  }, []);
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><StatusBar style="dark" />
    <QueryClientProvider client={query}>
      {error ? <View style={styles.center}><Text style={styles.heading}>Spndrr needs setup</Text><ErrorNotice message={error} /></View>
        : runtime ? <SessionGate runtime={runtime} /> : <Loading label="Opening Spndrr…" />}
    </QueryClientProvider>
  </SafeAreaProvider></GestureHandlerRootView>;
}
