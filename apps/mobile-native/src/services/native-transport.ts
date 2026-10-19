import CookieManager, { type Cookie } from '@preeternal/react-native-cookie-manager';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Transport } from '@spndrr/finance-core';
import { SecureJsonStore, type SecureBackend } from './secure-json';
import { authCookieNames, authCookieSnapshot, usesAuthCookies } from './auth-cookie-policy';

export const secureBackend: SecureBackend = {
  get: key => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: key => SecureStore.deleteItemAsync(key),
};
export function validateApiOrigin(value: string | undefined): string {
  if (!value) throw Error('Set EXPO_PUBLIC_API_URL to your HTTPS backend origin and rebuild.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('EXPO_PUBLIC_API_URL must be an HTTPS origin without a path or credentials.');
  return url.origin;
}
export async function scopedVault(origin: string, purpose: string): Promise<SecureJsonStore> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${origin}|${purpose}`);
  return new SecureJsonStore(secureBackend, `spndrr.${digest}`);
}

export async function createNativeTransport(origin: string): Promise<{ transport: Transport; clear: () => Promise<void> }> {
  const authUrl = `${origin}/api/auth`;
  const cookies = await scopedVault(origin, 'session');
  const clearJar = async () => {
    // This native app has one API cookie jar and no embedded web sessions.
    // Clear the app-owned Foundation/Android jar; the maintained TurboModule flushes mutations.
    await CookieManager.clearAll();
  };
  // The platform jar is used only during auth requests. SecureStore owns persistence.
  await clearJar();
  const clear = async () => { await cookies.remove(); await clearJar(); };
  const transport: Transport = async request => {
    const auth = usesAuthCookies(request.path, request.method);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20000);
    try {
      if (auth) {
        const stored = await cookies.get();
        if (Array.isArray(stored)) for (const cookie of stored as Cookie[]) {
          if (cookie && authCookieNames.some(name => name === cookie.name) && cookie.httpOnly && cookie.secure) await CookieManager.set(authUrl, cookie);
        }
      }
      const response = await fetch(`${origin}${request.path}`, {
        method: request.method, credentials: auth ? 'include' : 'omit', signal: abort.signal,
        headers: { Accept: 'application/json', ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...request.headers },
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
      });
      if (auth && response.ok && !request.path.endsWith('/logout')) {
        const jar = await CookieManager.get(authUrl);
        // Android getCookie returns name/value without the original attributes.
        // Apply the backend's known HTTPS-only /api/auth policy on restoration.
        const snapshot = authCookieSnapshot(jar, new URL(origin).hostname);
        if (!snapshot.some(c => c.name === 'mm_refresh')) throw Error('The native refresh cookie was not available securely.');
        await cookies.put(snapshot);
      }
      const text = await response.text();
      let data: unknown = null;
      if (text) { try { data = JSON.parse(text); } catch { /* The client validates successful financial responses. */ } }
      return { status: response.status, data };
    } finally {
      clearTimeout(timer);
      if (auth) await clearJar();
    }
  };
  return { transport, clear };
}
