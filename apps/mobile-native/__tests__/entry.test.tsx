import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, FinanceClient, emptyDraft, type ComposerDraft, type EntryResources } from '@spndrr/finance-core';
import { EntryProvider } from '../src/state/entry';
import { SecureJsonStore } from '../src/services/secure-json';
import { fixtureTransport } from '../src/services/fixture-transport';
import { ComposerScreen } from '../src/screens/Composer';
import { PickerScreen } from '../src/screens/Picker';
import { ManualForm } from '../src/ui/ManualForm';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-community/datetimepicker', () => ({ __esModule: true, default: () => null, DateTimePickerAndroid: { open: jest.fn() } }));
const navigation = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() };
async function setup(mode: 'manual' | 'text' = 'manual', description = '', income = false) {
  const fixture = fixtureTransport(); const client = new FinanceClient(fixture.transport, fixture.clear);
  await client.login('qa@example.test', 'fixture-only');
  const [catalog, accounts, settings] = await Promise.all([client.categories(), client.accounts(), client.settings()]);
  const resources: EntryResources = { categories: catalog.categories, accounts, settings, householdId: catalog.householdId, canWrite: true, today: '2026-10-19' };
  const values = new Map<string, string>();
  const vault = new SecureJsonStore({ get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, remove: async key => { values.delete(key); } }, 'test');
  const draft: ComposerDraft = { version: 1, ownerId: 'alice', text: '', assistantUncertain: false, pendingManual: null,
    manual: { ...emptyDraft(settings, resources.today), eventKind: income ? 'Income' : 'Purchase', amount: mode === 'manual' ? '40.29' : '', accountId: accounts[1]!.id, categoryId: income ? 'salary' : 'groceries', description } };
  await vault.put(draft);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrap = (element: ReactNode) => <QueryClientProvider client={query}><EntryProvider ownerId="alice" resources={resources} client={client} vault={vault}>{element}</EntryProvider></QueryClientProvider>;
  return { client, resources, draft, wrap };
}
beforeEach(() => jest.clearAllMocks());
test('currency input and hierarchical/exact account labels remain accessible', async () => {
  const { resources, draft } = await setup();
  const screen = render(<ManualForm draft={draft.manual} resources={resources} disabled={false} onChange={jest.fn()} onSelect={jest.fn()} />);
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
test('manual entry persists a real receipt only after API acknowledgement', async () => {
  const { wrap, client } = await setup();
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('Save transaction')).toBeTruthy());
  fireEvent.press(screen.getByText('Save transaction'));
  await waitFor(() => expect(screen.getByText('Transaction saved')).toBeTruthy());
  expect((await client.transactions('2026-10')).items).toHaveLength(1);
});
test('manual income preserves its own event kind and income category', async () => {
  const { wrap, client } = await setup('manual', 'Salary receipt', true);
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('Save transaction')).toBeTruthy());
  fireEvent.press(screen.getByText('Save transaction'));
  await waitFor(() => expect(screen.getByText('Transaction saved')).toBeTruthy());
  const records = (await client.transactions('2026-10')).items;
  expect(records).toHaveLength(1); expect(records[0]?.kind).toBe('Income'); expect(records[0]?.categoryId).toBe('salary');
});
test('unknown manual outcome locks details and retries the same operation without duplication', async () => {
  const { wrap, client } = await setup('manual', 'simulate lost response');
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('Save transaction')).toBeTruthy());
  fireEvent.press(screen.getByText('Save transaction'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry this transaction' }).props.accessibilityState.busy).toBe(false));
  expect(screen.getByLabelText('Amount (INR)').props.editable).toBe(false);
  fireEvent.press(screen.getByText('Retry this transaction'));
  await waitFor(() => expect(screen.getByText('Transaction saved')).toBeTruthy());
  expect((await client.transactions('2026-10')).items).toHaveLength(1);
});
test('backend validation leaves the manual input intact and editable', async () => {
  const { wrap } = await setup('manual', 'simulate validation');
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('Save transaction')).toBeTruthy());
  fireEvent.press(screen.getByText('Save transaction'));
  await waitFor(() => expect(screen.getByText('Check this amount.')).toBeTruthy());
  expect(screen.getByLabelText('Amount (INR)').props.value).toBe('40.29');
  expect(screen.getByLabelText('Amount (INR)').props.editable).toBe(true);
});
test('a rejected retry cannot unlock the earlier uncertain save', async () => {
  const { wrap, client } = await setup('manual', 'simulate lost response');
  const original = client.createTransaction.bind(client);
  jest.spyOn(client, 'createTransaction').mockImplementationOnce(original).mockRejectedValueOnce(new ApiError('The selected account is no longer active.', 400));
  const screen = render(wrap(<ComposerScreen navigation={navigation as never} route={{ key: 'composer', name: 'Composer' }} />));
  await waitFor(() => expect(screen.getByText('Save transaction')).toBeTruthy());
  fireEvent.press(screen.getByText('Save transaction'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry this transaction' }).props.accessibilityState.busy).toBe(false));
  fireEvent.press(screen.getByText('Retry this transaction'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry this transaction' }).props.accessibilityState.busy).toBe(false));
  expect(screen.getByLabelText('Amount (INR)').props.editable).toBe(false);
  expect((await client.transactions('2026-10')).items).toHaveLength(1);
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
  const screen = render(wrap(<PickerScreen navigation={navigation as never} route={{ key: 'picker', name: 'Picker', params: { kind: 'category' } }} />));
  await waitFor(() => expect(screen.getByLabelText('Search category')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Search category'), 'Grocer');
  expect(screen.getByText('Food / Groceries')).toBeTruthy();
  expect(screen.queryByText('Salary')).toBeNull();
});
