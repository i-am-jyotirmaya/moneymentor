import Constants from 'expo-constants';
import { Linking } from 'react-native';
import { createNativeTransport, scopedVault, validateApiOrigin } from '../src/services/native-transport';
import { createRuntime } from '../src/services/runtime';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
jest.mock('../src/services/native-transport', () => ({
  createNativeTransport: jest.fn(), scopedVault: jest.fn(), validateApiOrigin: jest.fn(),
}));
const vault = { get: jest.fn(), put: jest.fn(), remove: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  Constants.expoConfig!.extra = { fixture: false, appVariant: 'production' };
  vault.get.mockResolvedValue(null); vault.put.mockResolvedValue(undefined); vault.remove.mockResolvedValue(undefined);
  jest.mocked(scopedVault).mockResolvedValue(vault as never);
  jest.mocked(validateApiOrigin).mockReturnValue('https://api.example.test');
  jest.mocked(createNativeTransport).mockResolvedValue({ transport: jest.fn(), clear: jest.fn() });
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('spndrr-native://qa?api=https%3A%2F%2Flocalhost%3A7443');
});
afterEach(() => jest.restoreAllMocks());

test('production never reads a QA deep link or persisted QA server selection', async () => {
  const runtime = await createRuntime();
  expect(runtime.fixture).toBe(false); expect(Linking.getInitialURL).not.toHaveBeenCalled();
  expect(scopedVault).not.toHaveBeenCalled(); expect(createNativeTransport).toHaveBeenCalledWith('https://api.example.test');
});
test('a fixture flag outside the isolated QA variant is rejected before native setup', async () => {
  Constants.expoConfig!.extra = { fixture: true, appVariant: 'production' };
  await expect(createRuntime()).rejects.toThrow('Invalid QA build configuration.');
  expect(createNativeTransport).not.toHaveBeenCalled(); expect(scopedVault).not.toHaveBeenCalled();
});
test('the QA loopback scenario uses the actual native adapter and persists only its local origin', async () => {
  Constants.expoConfig!.extra = { fixture: true, appVariant: 'e2e' };
  const runtime = await createRuntime();
  expect(runtime.fixture).toBe(false); expect(createNativeTransport).toHaveBeenCalledWith('https://localhost:7443');
  expect(vault.put).toHaveBeenCalledWith({ origin: 'https://localhost:7443' });
});
test('QA process restart restores native routing instead of silently returning to fixtures', async () => {
  Constants.expoConfig!.extra = { fixture: true, appVariant: 'e2e' };
  jest.mocked(Linking.getInitialURL).mockResolvedValue(null); vault.get.mockResolvedValue({ origin: 'https://localhost:7443' });
  expect((await createRuntime()).fixture).toBe(false);
  expect(createNativeTransport).toHaveBeenCalledWith('https://localhost:7443');
});
test('QA routing rejects an external origin before any native request can be made', async () => {
  Constants.expoConfig!.extra = { fixture: true, appVariant: 'e2e' };
  jest.mocked(Linking.getInitialURL).mockResolvedValue('spndrr-native://qa?api=https%3A%2F%2Fexternal.example.test');
  await expect(createRuntime()).rejects.toThrow('isolated HTTPS loopback server'); expect(createNativeTransport).not.toHaveBeenCalled();
});
test('the default QA installation remains a deterministic fixture with no native cookie adapter', async () => {
  Constants.expoConfig!.extra = { fixture: true, appVariant: 'e2e' };
  jest.mocked(Linking.getInitialURL).mockResolvedValue(null);
  const runtime = await createRuntime(); expect(runtime.fixture).toBe(true); expect(createNativeTransport).not.toHaveBeenCalled();
  expect(vault.remove).toHaveBeenCalled(); await runtime.client.login('qa@example.test', 'fixture-only');
  expect(runtime.client.getSnapshot().session?.user.email).toBe('qa@example.test');
});
