import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, FinanceClient, workspaceApi, type EntryResources } from '@spndrr/finance-core';
import { fixtureTransport } from '../src/services/fixture-transport';
import { SecureJsonStore } from '../src/services/secure-json';
import { EntryProvider } from '../src/state/entry';
import { OperationsProvider } from '../src/state/operations';
import { PlanningRunsProvider } from '../src/state/planning-runs';
import { WorkspaceProvider } from '../src/state/workspace';
import { FinancialEventScreen } from '../src/screens/FinancialEvent';
import { AccountFormScreen } from '../src/screens/Accounts';
import { CategoryFormScreen } from '../src/screens/Categories';
import { GoalFormScreen, GoalScreen } from '../src/screens/Goals';
import { TransactionScreen } from '../src/screens/Transactions';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('../src/services/share-export', () => ({ clearExportCache: jest.fn() }));
const navigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };
async function setup(readOnly = false) {
  const fixture = fixtureTransport(); const client = new FinanceClient(fixture.transport, fixture.clear);
  await client.login('qa@example.test', 'fixture-only'); const api = workspaceApi(client);
  const [catalog, accounts, settings, dashboard] = await Promise.all([client.categories(), client.accounts(), client.settings(), api.households()]);
  const resources: EntryResources = { categories: catalog.categories, accounts, settings, householdId: catalog.householdId, canWrite: !readOnly, today: '2026-10-20' };
  const ownerId = client.getSnapshot().session!.user.id;
  const values = new Map<string, string>(); const backend = { get: async (key: string) => values.get(key) ?? null, set: async (key: string, value: string) => { values.set(key, value); }, remove: async (key: string) => { values.delete(key); } };
  const draft = new SecureJsonStore(backend, 'draft'); const operations = new SecureJsonStore(backend, 'operations'); const planning = new SecureJsonStore(backend, 'planning');
  const query = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const wrap = (node: ReactNode) => <QueryClientProvider client={query}><OperationsProvider ownerId={ownerId} vault={operations}><PlanningRunsProvider ownerId={ownerId} vault={planning}><EntryProvider ownerId={ownerId} resources={resources} client={client} vault={draft}><WorkspaceProvider household={dashboard.households[0]!} settings={settings} onSwitch={jest.fn()}>{node}</WorkspaceProvider></EntryProvider></PlanningRunsProvider></OperationsProvider></QueryClientProvider>;
  return { client, api, resources, wrap, planning, operations };
}
type TestScreen = ReturnType<typeof render>;
async function cardPayment(screen: TestScreen) {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save financial event' }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByRole('button', { name: 'Event: Transfer' })); fireEvent.press(screen.getByRole('radio', { name: 'Credit Card Payment' }));
  fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '123.45');
  fireEvent.press(screen.getByRole('button', { name: /From account:/ })); fireEvent.press(screen.getByRole('radio', { name: 'Kotak, BankAccount' }));
  fireEvent.press(screen.getByRole('button', { name: /To account:/ })); fireEvent.press(screen.getByRole('radio', { name: 'Kotak upi, CreditCard' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save financial event' }));
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());
test('native card payment preserves the two exact account identities and transfer semantics', async () => {
  const { client, resources, wrap } = await setup();
  const screen = render(wrap(<FinancialEventScreen navigation={navigation as never} route={{ key: 'event', name: 'FinancialEvent', params: undefined }} />));
  await cardPayment(screen); await waitFor(() => expect(screen.getByText('Financial event saved')).toBeTruthy());
  const items = (await client.transactions('2026-10')).items;
  expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ kind: 'CreditCardPayment', type: 'Transfer', amount: 123.45, accountId: resources.accounts[0]!.id, counterpartyAccountId: resources.accounts[1]!.id });
});
test('an unknown financial-event write blocks a different financial form after remount', async () => {
  const { client, operations, wrap } = await setup(); const send = jest.spyOn(client, 'createFinancialEvent').mockRejectedValue(new ApiError('Response lost after commit', 0, 'unknown'));
  const first = render(wrap(<FinancialEventScreen navigation={navigation as never} route={{ key: 'event', name: 'FinancialEvent', params: undefined }} />));
  await cardPayment(first); await waitFor(() => expect(first.getByText('Response lost after commit')).toBeTruthy()); first.unmount();
  expect(await operations.get()).toMatchObject({ label: 'Save financial event' });
  const second = render(wrap(<AccountFormScreen navigation={navigation as never} route={{ key: 'account', name: 'AccountForm', params: undefined }} />));
  await waitFor(() => expect(second.getByText('Review your earlier change')).toBeTruthy());
  fireEvent.changeText(second.getByLabelText('Account name'), 'Another bank');
  expect(second.getByRole('button', { name: 'Save account' }).props.accessibilityState.disabled).toBe(true); expect(send).toHaveBeenCalledTimes(1);
});
test('goals record exact contributions and restore the last asynchronous planning run', async () => {
  const { api, resources, wrap, planning } = await setup();
  const screen = render(wrap(<GoalFormScreen navigation={navigation as never} route={{ key: 'goal-form', name: 'GoalForm', params: undefined }} />));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save goal' }).props.accessibilityState.disabled).toBe(false));
  fireEvent.changeText(screen.getByLabelText('Goal name'), 'Laptop'); fireEvent.changeText(screen.getByLabelText('Target amount (INR)'), '5000'); fireEvent.press(screen.getByText('Save goal'));
  await waitFor(() => expect(screen.getByText('Goal saved')).toBeTruthy()); const goal = (await api.goals(resources.householdId))[0]!;
  screen.rerender(wrap(<GoalScreen navigation={navigation as never} route={{ key: 'goal', name: 'Goal', params: { id: goal.id } }} />));
  await waitFor(() => expect(screen.getByLabelText('Contribution (INR)')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Contribution (INR)'), '100.25'); fireEvent.press(screen.getByText('Record contribution'));
  await waitFor(() => expect(screen.getByText('Contribution recorded.')).toBeTruthy()); expect((await api.goal(goal.id)).goal.currentAmount).toBe(100.25);
  fireEvent.press(screen.getByText('Generate plan')); await waitFor(() => expect(screen.getByText('Version 1 · Generated')).toBeTruthy(), { timeout: 5000 });
  expect(await planning.get()).toMatchObject({ records: { [goal.id]: { goalId: goal.id, householdId: resources.householdId } } }); screen.unmount();
  const restored = render(wrap(<GoalScreen navigation={navigation as never} route={{ key: 'goal', name: 'Goal', params: { id: goal.id } }} />));
  await waitFor(() => expect(restored.getByText(/Plan Generate · Succeeded/)).toBeTruthy()); expect((await api.goal(goal.id)).plan!.versions).toHaveLength(1);
});
test('a view-only household cannot submit goal or account changes', async () => {
  const { wrap, client } = await setup(true); const write = jest.spyOn(client, 'request');
  const screen = render(wrap(<AccountFormScreen navigation={navigation as never} route={{ key: 'account', name: 'AccountForm', params: undefined }} />));
  await waitFor(() => expect(screen.getByLabelText('Account name')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Save account' }).props.accessibilityState.disabled).toBe(true);
  expect(write.mock.calls.some(([, method]) => method === 'POST' || method === 'PUT')).toBe(false);
});
test('system categories are read only and account sharing is fixed after creation', async () => {
  const { wrap, resources } = await setup(); const screen = render(wrap(<CategoryFormScreen navigation={navigation as never} route={{ key: 'category', name: 'CategoryForm', params: { id: 'groceries' } }} />));
  await waitFor(() => expect(screen.getByText(/System categories are read only/)).toBeTruthy()); expect(screen.queryByRole('button', { name: 'Save category' })).toBeNull();
  screen.rerender(wrap(<AccountFormScreen navigation={navigation as never} route={{ key: 'account', name: 'AccountForm', params: { id: resources.accounts[0]!.id } }} />));
  expect(screen.getByRole('switch', { name: 'Shared household account' }).props.disabled).toBe(true);
});
test('transaction trash and restoration update history without permanently deleting the record', async () => {
  const { client, api, resources, wrap } = await setup();
  const item = await client.createTransaction({ eventKind: 'Purchase', amount: 40.29, date: resources.today, accountId: resources.accounts[0]!.id, categoryId: 'groceries', householdId: resources.householdId, merchant: null, description: 'Weekly shop', sourceText: '', paymentChannel: 'UPI', visibility: 'Private', inputMode: 'Text', externalReference: 'native:trash-acceptance', confidence: 1 });
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { buttons?.find(button => button.style === 'destructive')?.onPress?.(); });
  const screen = render(wrap(<TransactionScreen navigation={navigation as never} route={{ key: 'transaction', name: 'Transaction', params: { id: item.id } }} />));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Move to trash' }).props.accessibilityState.disabled).toBe(false)); fireEvent.press(screen.getByText('Move to trash'));
  await waitFor(() => expect(screen.getByText('Restore transaction')).toBeTruthy()); expect((await client.transactions('2026-10')).items).toHaveLength(0); expect((await api.trash(resources.householdId)).items).toHaveLength(1);
  fireEvent.press(screen.getByText('Restore transaction')); await waitFor(() => expect(screen.getByText('Move to trash')).toBeTruthy()); expect((await client.transactions('2026-10')).items[0]!.id).toBe(item.id);
});
