"use client";

import { Capacitor } from "@capacitor/core";
import { CapacitorPasskey, type PasskeyPublicKeyCredentialCreationOptionsJSON,
  type PasskeyPublicKeyCredentialRequestOptionsJSON } from "@capgo/capacitor-passkey";
import { useEffect, useState } from "react";
import { apiRequest, refreshSession, type AuthSession } from "../../web/lib/api";
import { canRefreshSession, getAuthSessionSnapshot } from "../../web/lib/auth-session";

export type PasskeySummary = { id: string; createdAt: string };
type Options<T> = { challengeId: string; publicKey: T };
const path = "/api/auth/passkeys";

export function usePasskeySupport() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    void CapacitorPasskey.isSupported().then(result => { if (active) setSupported(result.available); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return supported;
}

export async function signInWithPasskey() {
  const { challengeId, publicKey } = await apiRequest<Options<PasskeyPublicKeyCredentialRequestOptionsJSON>>(`${path}/login/options`, { method: "POST" });
  let credential;
  try { credential = await CapacitorPasskey.getCredential({ publicKey }); }
  catch (error) {
    if (cancelled(error)) return null;
    throw new Error("No passkey could sign you in. Try again or use your password.");
  }
  return apiRequest<AuthSession>(`${path}/login/verify`, { method: "POST", body: { challengeId, credential } });
}

export async function addPasskey(password: string) {
  const accessToken = await validAccessToken(5 * 60_000);
  const { challengeId, publicKey } = await apiRequest<Options<PasskeyPublicKeyCredentialCreationOptionsJSON>>(`${path}/registration/options`, { method: "POST", accessToken, body: { password } });
  let credential;
  try { credential = await CapacitorPasskey.createCredential({ publicKey }); }
  catch (error) {
    if (cancelled(error)) return false;
    throw new Error("This device could not create a passkey. Check your password manager and try again.");
  }
  await apiRequest<void>(`${path}/registration/verify`, { method: "POST", accessToken, body: { challengeId, credential } });
  return true;
}

export const listPasskeys = async () => apiRequest<PasskeySummary[]>(path, { accessToken: await validAccessToken() });
export const removePasskey = async (id: string, password: string) =>
  apiRequest<void>(`${path}/${encodeURIComponent(id)}/remove`, { method: "POST", accessToken: await validAccessToken(), body: { password } });

async function validAccessToken(minimumLifetime = 30_000) {
  const session = getAuthSessionSnapshot();
  if (!session || !canRefreshSession()) throw new Error("Sign in or unlock Spndrr to continue.");
  if (Date.parse(session.accessTokenExpiresAt) <= Date.now() + minimumLifetime) return (await refreshSession()).accessToken;
  return session.accessToken;
}

function cancelled(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "AbortError";
}
