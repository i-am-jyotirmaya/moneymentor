import type { AuthSession } from "./api";

const SESSION_CHANGED_EVENT = "moneymentor.auth.session.changed";

let sessionSnapshot: AuthSession | null = null;

export function saveAuthSession(session: AuthSession) {
  sessionSnapshot = session;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
}

export function readAuthSession() {
  return sessionSnapshot;
}

export function clearAuthSession() {
  sessionSnapshot = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
}

export function isAccessTokenExpired(session: AuthSession) {
  return new Date(session.accessTokenExpiresAt).getTime() <= Date.now();
}

export function getAuthSessionSnapshot() {
  return sessionSnapshot;
}

export function subscribeToAuthSession(listener: () => void) {
  window.addEventListener(SESSION_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SESSION_CHANGED_EVENT, listener);
}
