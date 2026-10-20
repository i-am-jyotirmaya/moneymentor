import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider, focusManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { dateInTimeZone, workspaceApi, type AuthSession, type EntryResources, type HouseholdSummary } from '@spndrr/finance-core';
import { createRuntime, type Runtime } from './services/runtime';
import type { SecureJsonStore } from './services/secure-json';
import { EntryProvider } from './state/entry';
import { OperationsProvider } from './state/operations';
import { PlanningRunsProvider } from './state/planning-runs';
import { WorkspaceProvider } from './state/workspace';
import { Button, ErrorNotice, KeyboardDismissButton, Loading, styles, useReducedMotion } from './ui/primitives';
import { color } from './ui/theme';
import { LoginScreen, PrivacyScreen } from './screens/Auth';
import { ComposerScreen } from './screens/Composer';
import { NativeTabs } from './screens/NativeTabs';
import { TransactionScreen, TransactionsScreen } from './screens/Transactions';
import { FinancialEventScreen } from './screens/FinancialEvent';
import { AccountFormScreen, AccountsScreen } from './screens/Accounts';
import { CategoriesScreen, CategoryFormScreen } from './screens/Categories';
import { GoalFormScreen, GoalScreen, GoalsScreen } from './screens/Goals';
import { CommitmentFormScreen, CommitmentsScreen } from './screens/Commitments';
import { InsightsScreen } from './screens/Insights';
import { HouseholdsScreen } from './screens/Households';
import { SettingsScreen } from './screens/Settings';
import { PickerScreen } from './screens/Picker';
import { EditScreen } from './screens/Edit';
import { AddAccountScreen } from './screens/AddAccount';
import type { Routes } from './navigation';

const Stack = createNativeStackNavigator<Routes>();
const navigationTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: color.ink, background: color.background, card: color.background, text: color.ink, border: color.border } };

function Workspace({ runtime, session }: { runtime: Runtime; session: AuthSession }) {
  const reduced = useReducedMotion();
  const [clock, setClock] = useState(() => Date.now());
  const [selectedScope, setSelectedScope] = useState<string | undefined>();
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const query = useQuery({ queryKey: ['entry', session.user.id, selectedScope ?? 'default'], queryFn: async () => {
    const [catalog, accounts, settings, households] = await Promise.all([runtime.client.categories(selectedScope), runtime.client.accounts(selectedScope), runtime.client.settings(), workspaceApi(runtime.client).households()]);
    const household = households.households.find(item => item.id === catalog.householdId && item.status === 'Active');
    if (!household) throw Error('This household is no longer available.');
    return { catalog, accounts, settings, households, household };
  }, staleTime: 60000, retry: 1 });
  const [draftStore, setDraftStore] = useState<{ scope: string; vault: SecureJsonStore } | null>(null);
  const [operationVault, setOperationVault] = useState<SecureJsonStore | null>(null);
  const [planningVault, setPlanningVault] = useState<SecureJsonStore | null>(null);
  const [vaultError, setVaultError] = useState(false);
  const [vaultAttempt, setVaultAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([runtime.operationVault(session.user.id), runtime.planningVault(session.user.id)]).then(([operations, planning]) => {
      if (alive) { setOperationVault(operations); setPlanningVault(planning); }
    }).catch(() => { if (alive) setVaultError(true); });
    return () => { alive = false; };
  }, [runtime, session.user.id, vaultAttempt]);
  const scope = query.data?.catalog.householdId;
  const defaultScope = query.data?.households.defaultHouseholdId;
  useEffect(() => {
    if (!scope) return;
    let alive = true;
    void runtime.draftVault(session.user.id, scope === defaultScope ? undefined : scope).then(vault => { if (alive) setDraftStore({ scope, vault }); }).catch(() => { if (alive) setVaultError(true); });
    return () => { alive = false; };
  }, [runtime, session.user.id, scope, defaultScope, vaultAttempt]);
  const resources = useMemo<EntryResources | null>(() => query.data ? ({ categories: query.data.catalog.categories, accounts: query.data.accounts,
    settings: { ...query.data.settings, currencyCode: query.data.household.currencyCode, timeZone: query.data.household.timeZone }, householdId: query.data.catalog.householdId, canWrite: query.data.catalog.canWrite && query.data.household.canWrite && !query.isError,
    today: dateInTimeZone(query.data.household.timeZone, new Date(clock)) }) : null, [query.data, query.isError, clock]);
  if ((query.isError && !query.data) || vaultError) return <View style={styles.center}><ErrorNotice message={vaultError ? 'Secure device storage is unavailable.' : 'Your categories and accounts could not be loaded.'} onRetry={() => { setVaultError(false); setVaultAttempt(previous => previous + 1); void query.refetch(); }} />
    {selectedScope ? <Button title="Return to personal workspace" secondary onPress={() => setSelectedScope(undefined)} /> : null}
    <Button title="Sign out" secondary onPress={() => { void runtime.client.logout().catch(() => undefined); }} /></View>;
  if (!resources || !draftStore || draftStore.scope !== scope || !operationVault || !planningVault || !query.data) return <Loading />;
  return <OperationsProvider key={session.user.id} ownerId={session.user.id} vault={operationVault}><PlanningRunsProvider ownerId={session.user.id} vault={planningVault}>
    <EntryProvider key={scope} ownerId={session.user.id} client={runtime.client} resources={resources} vault={draftStore.vault}>
    <WorkspaceProvider household={query.data.household} settings={query.data.settings} onSwitch={(household: HouseholdSummary) => setSelectedScope(household.id)}>
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: color.background }, headerStyle: { backgroundColor: color.background }, headerTintColor: color.ink,
        headerShadowVisible: false, headerRight: () => <KeyboardDismissButton />, animation: reduced ? 'none' : 'default', gestureEnabled: true }}>
        <Stack.Screen name="Home" component={NativeTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Composer" component={ComposerScreen} options={({ navigation }) => ({ title: 'Add transaction', presentation: 'modal', animation: reduced ? 'none' : 'slide_from_bottom',
          headerLeft: () => <Button title="Close" accessibilityLabel="Close transaction composer" testID="composer-close" secondary onPress={() => navigation.goBack()} /> })} />
        <Stack.Screen name="Picker" component={PickerScreen} options={{ title: 'Choose', presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
        <Stack.Screen name="Edit" component={EditScreen} options={{ title: 'Edit transaction' }} />
        <Stack.Screen name="AddAccount" component={AddAccountScreen} options={{ title: 'Add account' }} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
        <Stack.Screen name="Transaction" component={TransactionScreen} options={{ title: 'Transaction' }} />
        <Stack.Screen name="FinancialEvent" component={FinancialEventScreen} options={{ title: 'Financial event', presentation: 'modal' }} />
        <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'Accounts' }} />
        <Stack.Screen name="AccountForm" component={AccountFormScreen} options={{ title: 'Account' }} />
        <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: 'Categories' }} />
        <Stack.Screen name="CategoryForm" component={CategoryFormScreen} options={{ title: 'Category' }} />
        <Stack.Screen name="Goals" component={GoalsScreen} options={{ title: 'Goals' }} />
        <Stack.Screen name="Goal" component={GoalScreen} options={{ title: 'Goal and plan' }} />
        <Stack.Screen name="GoalForm" component={GoalFormScreen} options={{ title: 'Goal' }} />
        <Stack.Screen name="Commitments" component={CommitmentsScreen} options={{ title: 'Commitments' }} />
        <Stack.Screen name="CommitmentForm" component={CommitmentFormScreen} options={{ title: 'Commitment' }} />
        <Stack.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights' }} />
        <Stack.Screen name="Households" component={HouseholdsScreen} options={{ title: 'Households' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings and privacy' }} />
      </Stack.Navigator>
    </NavigationContainer>
  </WorkspaceProvider></EntryProvider></PlanningRunsProvider></OperationsProvider>;
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
