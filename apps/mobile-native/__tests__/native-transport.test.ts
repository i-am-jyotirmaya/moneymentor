import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';
import { createNativeTransport, validateApiOrigin } from '../src/services/native-transport';

jest.mock('@preeternal/react-native-cookie-manager', () => ({ __esModule: true, default: { clearAll: jest.fn(), get: jest.fn(), set: jest.fn() } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
const values = new Map<string, string>();
const origin = 'https://api.example.test';
const response = (status = 200, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }) as Response;
beforeEach(() => {
  jest.clearAllMocks(); values.clear();
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async key => values.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { values.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async key => { values.delete(key); });
  jest.mocked(CookieManager.clearAll).mockResolvedValue(true); jest.mocked(CookieManager.set).mockResolvedValue(true);
  jest.mocked(CookieManager.get).mockResolvedValue({ mm_refresh: { name: 'mm_refresh', value: 'test-refresh' }, mm_session: { name: 'mm_session', value: 'test-session' } });
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response());
});
afterEach(() => jest.restoreAllMocks());

test('API setup rejects credentials, HTTP, paths and query strings', () => {
  expect(validateApiOrigin(`${origin}/`)).toBe(origin);
  for (const input of [undefined, 'http://api.example.test', `${origin}/api`, `${origin}/?token=secret`, 'https://user:pass@api.example.test']) {
    expect(() => validateApiOrigin(input)).toThrow();
  }
});
test('auth cookies persist securely and restore into the auth-only jar after process restart', async () => {
  const first = await createNativeTransport(origin);
  await first.transport({ path: '/api/auth/login', method: 'POST', body: { email: 'fixture@example.test', password: 'fixture-only' } });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), expect.any(String), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  expect(CookieManager.clearAll).toHaveBeenCalledTimes(2);
  jest.mocked(CookieManager.set).mockClear();
  const reopened = await createNativeTransport(origin);
  await reopened.transport({ path: '/api/auth/refresh', method: 'POST' });
  expect(CookieManager.set).toHaveBeenCalledWith(`${origin}/api/auth`, expect.objectContaining({ name: 'mm_refresh', value: 'test-refresh', path: '/api/auth', domain: 'api.example.test', secure: true, httpOnly: true }));
  expect(fetch).toHaveBeenLastCalledWith(`${origin}/api/auth/refresh`, expect.objectContaining({ credentials: 'include' }));
  await reopened.clear(); expect(values.size).toBe(0);
});
test('financial reads never restore cookies or include platform credentials', async () => {
  const adapter = await createNativeTransport(origin);
  await adapter.transport({ path: '/api/transactions?month=2026-10', method: 'GET', headers: { Authorization: 'Bearer test-access' } });
  expect(CookieManager.set).not.toHaveBeenCalled(); expect(CookieManager.get).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith(`${origin}/api/transactions?month=2026-10`, expect.objectContaining({ credentials: 'omit', headers: expect.objectContaining({ Authorization: 'Bearer test-access' }) }));
});
test('public registration policy reads do not require or persist a refresh cookie', async () => {
  const adapter = await createNativeTransport(origin);
  await adapter.transport({ path: '/api/auth/registration', method: 'GET' });
  expect(CookieManager.get).not.toHaveBeenCalled(); expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith(`${origin}/api/auth/registration`, expect.objectContaining({ credentials: 'omit' }));
});
test('network failure still clears the native jar and never retries a write', async () => {
  const adapter = await createNativeTransport(origin);
  jest.mocked(fetch).mockRejectedValueOnce(Error('fixture network loss'));
  await expect(adapter.transport({ path: '/api/auth/login', method: 'POST', body: {} })).rejects.toThrow('fixture network loss');
  expect(fetch).toHaveBeenCalledTimes(1); expect(CookieManager.clearAll).toHaveBeenCalledTimes(2);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
test('a successful auth response without native refresh cookies fails closed and clears the jar', async () => {
  const adapter = await createNativeTransport(origin); jest.mocked(CookieManager.get).mockResolvedValue({});
  await expect(adapter.transport({ path: '/api/auth/login', method: 'POST', body: {} })).rejects.toThrow('native refresh cookie');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled(); expect(CookieManager.clearAll).toHaveBeenCalledTimes(2);
});
