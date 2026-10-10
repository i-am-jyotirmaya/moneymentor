import type { AuthSession } from "./api";

const SESSION_CHANGED_EVENT = "moneymentor.auth.session.changed";

type AuthState = {
  session: AuthSession | null;
  refreshPromise: Promise<AuthSession> | null;
};

declare global {
  interface Window {
    __spndrrAuthState?: AuthState;
  }
}

// Keep tokens in browser memory, while surviving Next.js module hot reloads.
function getAuthState(): AuthState | null {
  if (typeof window === "undefined") return null;
  return (window.__spndrrAuthState ??= { session: null, refreshPromise: null });
}

export function coordinateSessionRefresh(refresh: () => Promise<AuthSession>) {
  const state = getAuthState();
  if (state?.refreshPromise) return state.refreshPromise;

  // Cookies are shared by tabs; serialize rotation so they cannot reuse a token.
  const promise = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request("spndrr.auth.refresh", refresh);
    }
    return refresh();
  })();
  const pending = promise.finally(() => {
    if (state?.refreshPromise === pending) state.refreshPromise = null;
  });
  if (state) state.refreshPromise = pending;
  return pending;
}

export function saveAuthSession(session: AuthSession) {
  const state = getAuthState();
  if (state) state.session = session;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
}

export function readAuthSession() {
  return getAuthState()?.session ?? null;
}

export function clearAuthSession() {
  const state = getAuthState();
  if (state) state.session = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
}

export function isAccessTokenExpired(session: AuthSession) {
  return new Date(session.accessTokenExpiresAt).getTime() <= Date.now();
}

export function getAuthSessionSnapshot() {
  return getAuthState()?.session ?? null;
}

export function subscribeToAuthSession(listener: () => void) {
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SESSION_CHANGED_EVENT, listener);
}
