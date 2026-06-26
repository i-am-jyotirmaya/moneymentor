import type { AuthSession } from "./api";

const SESSION_STORAGE_KEY = "moneymentor.auth.session.v1";
const SESSION_CHANGED_EVENT = "moneymentor.auth.session.changed";

let lastRawSession: string | null = null;
let lastSessionSnapshot: AuthSession | null = null;

export function saveAuthSession(session: AuthSession) {
  const rawSession = JSON.stringify(session);
  lastRawSession = rawSession;
  lastSessionSnapshot = session;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, rawSession);
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function readAuthSession() {
  const value = window.sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as AuthSession;
    if (!session.accessToken || !session.user?.email) {
      clearAuthSession();
      return null;
    }

    return session;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function clearAuthSession() {
  lastRawSession = null;
  lastSessionSnapshot = null;
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function isAccessTokenExpired(session: AuthSession) {
  return new Date(session.accessTokenExpiresAt).getTime() <= Date.now();
}

export function getAuthSessionSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawSession) {
    lastRawSession = null;
    lastSessionSnapshot = null;
    return null;
  }

  if (rawSession === lastRawSession) {
    return lastSessionSnapshot;
  }

  try {
    const session = JSON.parse(rawSession) as AuthSession;

    if (!session.accessToken || !session.user?.email) {
      clearAuthSession();
      return null;
    }

    lastRawSession = rawSession;
    lastSessionSnapshot = session;

    if (isAccessTokenExpired(session)) {
      clearAuthSession();
      return null;
    }

    return session;
  } catch {
    clearAuthSession();
    return null;
  }
}

export function subscribeToAuthSession(listener: () => void) {
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
