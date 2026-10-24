import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Appearance, Text, View } from 'react-native';
import { useState } from 'react';
import { AppearanceSwitch } from '../src/ui/AppearanceSwitch';
import { Field, useStyles } from '../src/ui/primitives';
import { ThemeProvider, useTheme, type AppearanceStorage } from '../src/ui/theme';

function EditingProbe() {
  const { mode } = useTheme(); const styles = useStyles(); const [text, setText] = useState('Unsent groceries');
  return <View testID="page" style={styles.screen}><Text>{mode}</Text><Field label="Unsent message" value={text} onChangeText={setText} /><AppearanceSwitch /></View>;
}
function memoryStorage(initial: string | null = null): AppearanceStorage & { value: () => string | null } {
  let value = initial;
  return { get: async () => value, set: jest.fn(async next => { value = next; }), value: () => value };
}
afterEach(() => jest.restoreAllMocks());
test('light/dark switching recolors an open screen and keyboard without losing unsent text; choice survives restart', async () => {
  const storage = memoryStorage('light'); const native = jest.spyOn(Appearance, 'setColorScheme');
  const screen = render(<ThemeProvider appearanceStorage={storage}><EditingProbe /></ThemeProvider>);
  await waitFor(() => expect(screen.getByText('light')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Unsent message'), 'Still editing');
  fireEvent.press(screen.getByRole('radio', { name: 'Dark mode' }));
  await waitFor(() => expect(storage.value()).toBe('dark'));
  expect(screen.getByText('dark')).toBeTruthy(); expect(screen.getByLabelText('Unsent message').props.value).toBe('Still editing');
  expect(screen.getByLabelText('Unsent message').props.keyboardAppearance).toBe('dark');
  expect(native).toHaveBeenLastCalledWith('dark'); screen.unmount();
  const restarted = render(<ThemeProvider appearanceStorage={storage}><EditingProbe /></ThemeProvider>);
  await waitFor(() => expect(restarted.getByRole('radio', { name: 'Dark mode' }).props.accessibilityState.checked).toBe(true));
  fireEvent.press(restarted.getByRole('radio', { name: 'System mode' }));
  await waitFor(() => expect(storage.value()).toBe('system')); expect(native).toHaveBeenLastCalledWith('unspecified');
});
test('a slow preference restore cannot replace a user selection made while loading', async () => {
  let resolve!: (value: string) => void;
  const storage: AppearanceStorage = { get: () => new Promise(done => { resolve = done; }), set: async () => undefined };
  const screen = render(<ThemeProvider appearanceStorage={storage}><EditingProbe /></ThemeProvider>);
  fireEvent.press(screen.getByRole('radio', { name: 'Dark mode' }));
  await act(async () => { resolve('light'); });
  expect(screen.getByText('dark')).toBeTruthy();
});
test('preference writes stay ordered when appearances are changed rapidly', async () => {
  const writes: string[] = []; let finish!: () => void;
  const storage: AppearanceStorage = { get: async () => 'system', set: async value => { writes.push(value); if (value === 'dark') await new Promise<void>(done => { finish = done; }); } };
  const screen = render(<ThemeProvider appearanceStorage={storage}><EditingProbe /></ThemeProvider>);
  await act(async () => {});
  fireEvent.press(screen.getByRole('radio', { name: 'Dark mode' }));
  await waitFor(() => expect(writes).toEqual(['dark']));
  fireEvent.press(screen.getByRole('radio', { name: 'Light mode' }));
  expect(screen.getByText('light')).toBeTruthy();
  await act(async () => { finish(); }); expect(writes).toEqual(['dark', 'light']);
});
test('failed persistence keeps appearance usable and gives actionable feedback', async () => {
  const screen = render(<ThemeProvider appearanceStorage={{ get: async () => null, set: async () => { throw Error('Full'); } }}><EditingProbe /></ThemeProvider>);
  await act(async () => {}); fireEvent.press(screen.getByRole('radio', { name: 'Dark mode' }));
  await waitFor(() => expect(screen.getByText(/Appearance changed for now/)).toBeTruthy()); expect(screen.getByText('dark')).toBeTruthy();
});
