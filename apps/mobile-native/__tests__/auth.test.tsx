import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { FinanceClient } from '@spndrr/finance-core';
import { LoginScreen } from '../src/screens/Auth';
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
