import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FinanceClient, buildTransactionIntent, emptyDraft, type ComposerDraft, type EntryResources, type Transaction } from '@spndrr/finance-core';
import { EntryProvider, useEntry } from '../src/state/entry';
import { OperationsProvider } from '../src/state/operations';
import { SecureJsonStore } from '../src/services/secure-json';
import { fixtureTransport } from '../src/services/fixture-transport';
import { ComposerScreen } from '../src/screens/Composer';
import { PickerScreen } from '../src/screens/Picker';
import { TransactionEditForm } from '../src/ui/TransactionEditForm';
import { EditScreen } from '../src/screens/Edit';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), usePreventRemove: jest.fn() }));
const navigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
async function setup(mode: 'manual' | 'text' = 'manual', description = '', income = false, pending = false) {
  const fixture = fixtureTransport(); const client = new FinanceClient(fixture.transport, fixture.clear);
  await client.login('qa@example.test', 'fixture-only');
  const [catalog, accounts, settings] = await Promise.all([client.categories(), client.accounts(), client.settings()]);
  const resources: EntryResources = { categories: catalog.categories, accounts, settings, householdId: catalog.householdId, canWrite: true, today: '2026-10-19' };
  const values = new Map<string, string>();
  const vault = new SecureJsonStore({ get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } }, 'test');
  const draft: ComposerDraft = { version: 1, ownerId: 'alice', text: '', assistantUncertain: false, pendingManual: null,
    manual: { ...emptyDraft(settings, resources.today), eventKind: income ? 'Income' : 'Purchase', amount: mode === 'manual' ? '40.29' : '', accountId: accounts[1]!.id, categoryId: income ? 'salary' : 'groceries', description } };
  if (pending) draft.pendingManual = { payload: buildTransactionIntent(draft.manual, resources, 'native:legacy-pending'), phase: 'uncertain' };
  await vault.put(draft);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const operationVault = new SecureJsonStore({ get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } }, 'operations');
  const wrap = (element: ReactNode) => <QueryClientProvider client={query}><OperationsProvider ownerId="alice" vault={operationVault}><EntryProvider ownerId="alice" resources={resources} client={client} vault={vault}>{element}</EntryProvider></OperationsProvider></QueryClientProvider>;
  return { client, resources, draft, wrap, vault };
}
beforeEach(() => jest.clearAllMocks());
test('currency input and hierarchical/exact account labels remain accessible', async () => {
  const { resources, draft } = await setup();
  const screen = render(<TransactionEditForm draft={draft.manual} resources={resources} disabled={false} onChange={jest.fn()} onSelect={jest.fn()} />);
  expect(screen.getByLabelText('Amount (INR)').props.value).toBe('40.29');
  expect(screen.getByLabelText('Category: Food / Groceries')).toBeTruthy();
  expect(screen.getByLabelText('Account: Kotak upi · Credit card')).toBeTruthy();
});
test('unavailable dictation preserves text input and never sends an assistant message', async () => {
  const { wrap, client } = await setup('text'); const send = jest.spyOn(client, 'sendAssistant');
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('Use voice')).toBeTruthy());
  fireEvent.press(screen.getByText('Use voice'));
  expect(screen.getByText('Speech recognition is not available on this device. You can type instead.')).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Transaction message').props.editable).toBe(true);
});
test('assistant is the only creation path even with a restored unsent manual draft', async () => {
  const { wrap, client } = await setup(); const create = jest.spyOn(client, 'createTransaction');
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByLabelText('Transaction message')).toBeTruthy());
  expect(screen.queryByText('Enter details')).toBeNull(); expect(screen.queryByText('Save transaction')).toBeNull();
  expect(screen.queryByLabelText('Amount (INR)')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Transaction message'), 'Groceries for 240');
  fireEvent.press(screen.getByText('Send & track'));
  await waitFor(() => expect(screen.getByText('Transaction saved')).toBeTruthy());
  expect(create).not.toHaveBeenCalled(); expect((await client.transactions('2026-10')).items).toHaveLength(1);
  fireEvent.press(screen.getByText('Edit saved transaction')); expect(navigation.navigate).toHaveBeenCalledWith('Edit');
});
test('legacy uncertain manual save stays blocked across remount until explicitly reviewed', async () => {
  const { wrap, client, vault } = await setup('manual', '', false, true); const create = jest.spyOn(client, 'createTransaction'); const send = jest.spyOn(client, 'sendAssistant');
  let screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('I checked — clear pending draft')).toBeTruthy());
  expect(screen.getByLabelText('Transaction message').props.editable).toBe(false);
  expect(screen.getByRole('button', { name: 'Send & track' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.queryByText('Retry this transaction')).toBeNull(); screen.unmount();
  expect(await vault.get()).toMatchObject({ pendingManual: { phase: 'uncertain' } });
  screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer-2', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('I checked — clear pending draft')).toBeTruthy());
  fireEvent.press(screen.getByText('I checked — clear pending draft'));
  await waitFor(() => expect(screen.getByLabelText('Transaction message').props.editable).toBe(true));
  expect(create).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});
function PrepareEdit({ transaction }: { transaction: Transaction }) {
  const entry = useEntry(); const begin = useRef(entry.beginEdit);
  useEffect(() => { begin.current(transaction); }, [transaction]);
  return <EditScreen navigation={navigation as never} route={{ key: 'edit', name: 'Edit' }} />;
}
test('editing a saved transaction updates the original exact account and never creates a record', async () => {
  const { wrap, client, resources } = await setup('text');
  const receipt = await client.sendAssistant('Groceries 40.29', 'INR', '2026-10-19');
  const create = jest.spyOn(client, 'createTransaction');
  const screen = render(wrap(<PrepareEdit transaction={receipt.transaction!} />));
  await waitFor(() => expect(screen.getByLabelText('Amount (INR)')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Amount (INR)'), '45.50');
  fireEvent.press(screen.getByText('Save changes'));
  await waitFor(() => expect(screen.getByText('Changes saved')).toBeTruthy());
  const records = (await client.transactions('2026-10')).items;
  expect(records).toHaveLength(1); expect(records[0]).toMatchObject({ id: receipt.transaction!.id, amount: 45.5, accountId: resources.accounts[0]!.id });
  expect(create).not.toHaveBeenCalled();
});
test('assistant failure requires reconciliation before sending another message', async () => {
  const { wrap } = await setup('text');
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByLabelText('Transaction message')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Transaction message'), 'simulate failure');
  fireEvent.press(screen.getByText('Send & track'));
  await waitFor(() => expect(screen.getByText(/The connection was interrupted/)).toBeTruthy());
  expect(screen.getByText('Check recent transactions')).toBeTruthy();
  expect(screen.getByLabelText('Transaction message').props.editable).toBe(false);
  expect(screen.queryByText('Send & track')).toBeNull();
});
test('category search presents the subcategory path', async () => {
  const { wrap } = await setup();
  const screen = render(wrap(<PickerScreen navigation={navigation as never} route={{ key: 'picker', name: 'Picker', params: { kind: 'category', target: 'edit' } }} />));
  await waitFor(() => expect(screen.getByLabelText('Search category')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Search category'), 'Grocer');
  expect(screen.getByText('Food / Groceries')).toBeTruthy();
  expect(screen.queryByText('Salary')).toBeNull();
});
