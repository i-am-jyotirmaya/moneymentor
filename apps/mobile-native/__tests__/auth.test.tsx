import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { FinanceClient } from '@spndrr/finance-core';
import { ApiError } from '@spndrr/finance-core';
import { LoginScreen, PrivacyScreen } from '../src/screens/Auth';
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

test('hardware keyboard submit signs in using the entered credentials', async () => {
  const login = jest.fn(async () => undefined);
  const screen = render(<LoginScreen client={{ login } as unknown as FinanceClient} unavailable={false} onRestore={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Email'), 'qa@example.test');
  fireEvent.changeText(screen.getByLabelText('Password'), 'fixture-only');
  fireEvent(screen.getByLabelText('Password'), 'submitEditing');
  await waitFor(() => expect(login).toHaveBeenCalledWith('qa@example.test', 'fixture-only'));
});
test('failed sign-in preserves the entered email and exposes the correction path', async () => {
  const login = jest.fn(async () => { throw Error('Check your email or password.'); });
  const screen = render(<LoginScreen client={{ login } as unknown as FinanceClient} unavailable={false} onRestore={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Email'), 'qa@example.test');
  fireEvent.changeText(screen.getByLabelText('Password'), 'fixture-only');
  fireEvent.press(screen.getByText('Sign in'));
  await waitFor(() => expect(screen.getByText('Check your email or password.')).toBeTruthy());
  expect(screen.getByLabelText('Email').props.value).toBe('qa@example.test');
});

test('request-only signup cannot submit without an invitation and privacy acceptance', async () => {
  const signup = jest.fn();
  const client = { signup, registration: async () => ({ mode: 'RequestOnly' }), privacyPolicy: async () => ({ version: 'current', policyUrl: 'https://example.test/privacy' }) } as unknown as FinanceClient;
  const screen = render(<LoginScreen client={client} unavailable={false} onRestore={jest.fn()} />);
  fireEvent.press(screen.getByText('Create an account'));
  await waitFor(() => expect(screen.getByText('Spndrr beta uses signup invitations.')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Your name'), 'Alice');
  fireEvent.changeText(screen.getByLabelText('Email'), 'alice@example.test');
  fireEvent.changeText(screen.getByLabelText('New password'), 'fixture-only');
  fireEvent(screen.getByLabelText('I accept the current privacy policy'), 'valueChange', true);
  expect(screen.getByRole('button', { name: 'Create account' }).props.accessibilityState.disabled).toBe(true);
  expect(signup).not.toHaveBeenCalled();
});

test('an access request with an uncertain outcome offers email reconciliation and blocks a second send', async () => {
  const requestAccess = jest.fn(async () => { throw new ApiError('Response lost', 0, 'unknown'); });
  const screen = render(<LoginScreen client={{ requestAccess } as unknown as FinanceClient} unavailable={false} onRestore={jest.fn()} />);
  fireEvent.press(screen.getByText('Request beta access'));
  fireEvent.changeText(screen.getByLabelText('Your name'), 'Alice');
  fireEvent.changeText(screen.getByLabelText('Email'), 'alice@example.test');
  fireEvent.press(screen.getByText('Request access'));
  await waitFor(() => expect(screen.getByText('Your request may already have arrived. Check your email before requesting again.')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Request access' }).props.accessibilityState.disabled).toBe(true);
  expect(requestAccess).toHaveBeenCalledTimes(1);
});
test('privacy acceptance waits for and submits the actual server policy version', async () => {
  const policy = { version: 'server-policy-2026-10', effectiveDate: '2026-10-20', policyUrl: 'https://example.test/privacy', supportEmail: 'support@example.test' };
  let resolve!: (value: typeof policy) => void;
  const acceptPrivacy = jest.fn(async () => {}); const refresh = jest.fn(async () => {});
  const client = { privacyPolicy: () => new Promise(done => { resolve = done; }), acceptPrivacy, refresh } as unknown as FinanceClient;
  const screen = render(<PrivacyScreen client={client} onLogout={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Accept privacy policy' }).props.accessibilityState.disabled).toBe(true);
  await act(async () => resolve(policy)); fireEvent.press(screen.getByText('Accept privacy policy'));
  await waitFor(() => expect(acceptPrivacy).toHaveBeenCalledWith(policy.version)); expect(refresh).toHaveBeenCalledTimes(1);
});
test('a failed privacy-policy read cannot enable acceptance and can be retried', async () => {
  const privacyPolicy = jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ version: 'current', effectiveDate: '2026-10-20', policyUrl: 'https://example.test/privacy' });
  const acceptPrivacy = jest.fn();
  const screen = render(<PrivacyScreen client={{ privacyPolicy, acceptPrivacy } as unknown as FinanceClient} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('The current privacy policy could not be loaded. Retry before accepting.')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Accept privacy policy' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Accept privacy policy' }).props.accessibilityState.disabled).toBe(false));
  expect(acceptPrivacy).not.toHaveBeenCalled();
});
