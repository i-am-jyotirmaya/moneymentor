import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import { ExpoSpeechRecognitionModule as speech, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { VoiceInput } from '../src/ui/VoiceInput';

const listeners = new Map<string, (event: unknown) => void>();
const emit = (name: string, event: unknown = {}) => act(() => { listeners.get(name)?.(event); });
const permission = { granted: true, canAskAgain: true, expires: 'never', status: 'granted' };
beforeEach(() => {
  jest.clearAllMocks(); listeners.clear();
  jest.mocked(speech.isRecognitionAvailable).mockReturnValue(true);
  jest.mocked(speech.supportsOnDeviceRecognition).mockReturnValue(true);
  jest.mocked(speech.requestPermissionsAsync).mockResolvedValue(permission as never);
  jest.mocked(useSpeechRecognitionEvent).mockImplementation(((name: string, handler: (event: unknown) => void) => { listeners.set(name, handler); }) as never);
});
afterEach(() => jest.restoreAllMocks());

test('on-device dictation stays editable text and only final results update the draft', async () => {
  const transcript = jest.fn(); const busy = jest.fn();
  const screen = render(<VoiceInput text="Today" disabled={false} onTranscript={transcript} onBusyChange={busy} />);
  fireEvent.press(screen.getByText('Use voice'));
  await waitFor(() => expect(speech.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: true })));
  emit('start'); emit('result', { isFinal: false, results: [{ transcript: 'groceries' }] });
  expect(transcript).not.toHaveBeenCalled();
  emit('result', { isFinal: true, results: [{ transcript: 'groceries 240' }] });
  expect(transcript).toHaveBeenCalledWith('Today groceries 240');
  emit('end'); expect(busy).toHaveBeenLastCalledWith(false);
  expect(screen.getByText('Use voice')).toBeTruthy();
});

test('cancel ignores late results and drains the old recognizer before another session', async () => {
  const transcript = jest.fn(); const screen = render(<VoiceInput text="" disabled={false} onTranscript={transcript} onBusyChange={jest.fn()} />);
  fireEvent.press(screen.getByText('Use voice')); await waitFor(() => expect(speech.start).toHaveBeenCalled()); emit('start');
  fireEvent.press(screen.getByText('Cancel dictation'));
  emit('result', { isFinal: true, results: [{ transcript: 'late private result' }] });
  expect(transcript).not.toHaveBeenCalled(); expect(speech.abort).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Use voice')); expect(speech.start).toHaveBeenCalledTimes(1);
  emit('end'); fireEvent.press(screen.getByText('Use voice'));
  await waitFor(() => expect(speech.start).toHaveBeenCalledTimes(2));
});

test('cancelling an unresolved permission request cannot start recording later', async () => {
  let resolve!: (value: never) => void;
  jest.mocked(speech.requestPermissionsAsync).mockReturnValue(new Promise(done => { resolve = done; }));
  const screen = render(<VoiceInput text="Keep this" disabled={false} onTranscript={jest.fn()} onBusyChange={jest.fn()} />);
  fireEvent.press(screen.getByText('Use voice')); fireEvent.press(screen.getByText('Cancel dictation'));
  await act(async () => { resolve(permission as never); });
  expect(speech.start).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Use voice' }).props.accessibilityState.disabled).toBe(false);
});

test('denied permission leaves the typed draft untouched and offers device settings', async () => {
  jest.mocked(speech.requestPermissionsAsync).mockResolvedValue({ ...permission, granted: false, status: 'denied' } as never);
  const transcript = jest.fn(); const screen = render(<VoiceInput text="Keep this" disabled={false} onTranscript={transcript} onBusyChange={jest.fn()} />);
  fireEvent.press(screen.getByText('Use voice'));
  await waitFor(() => expect(screen.getByText('Open speech permissions')).toBeTruthy());
  expect(speech.start).not.toHaveBeenCalled(); expect(transcript).not.toHaveBeenCalled();
});

test('network speech requires explicit consent before requesting permissions', async () => {
  jest.mocked(speech.supportsOnDeviceRecognition).mockReturnValue(false);
  const alert = jest.spyOn(Alert, 'alert');
  const screen = render(<VoiceInput text="" disabled={false} onTranscript={jest.fn()} onBusyChange={jest.fn()} />);
  fireEvent.press(screen.getByText('Use voice'));
  expect(alert).toHaveBeenCalledWith('Use your system speech service?', expect.any(String), expect.any(Array));
  expect(speech.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('backgrounding aborts dictation and ignores results after unmount', async () => {
  let stateChange!: (state: string) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { stateChange = handler; return { remove: jest.fn() }; });
  const transcript = jest.fn(); const screen = render(<VoiceInput text="" disabled={false} onTranscript={transcript} onBusyChange={jest.fn()} />);
  fireEvent.press(screen.getByText('Use voice')); await waitFor(() => expect(speech.start).toHaveBeenCalled()); emit('start');
  act(() => stateChange('background')); emit('result', { isFinal: true, results: [{ transcript: 'ignore' }] });
  expect(transcript).not.toHaveBeenCalled(); expect(speech.abort).toHaveBeenCalled();
  screen.unmount(); emit('result', { isFinal: true, results: [{ transcript: 'also ignore' }] });
  expect(transcript).not.toHaveBeenCalled();
});
