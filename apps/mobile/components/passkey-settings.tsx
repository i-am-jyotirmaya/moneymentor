"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getAuthSessionSnapshot, subscribeToAuthSession } from "../../web/lib/auth-session";
import { addPasskey, listPasskeys, removePasskey, usePasskeySupport, type PasskeySummary } from "../lib/passkeys";

export function PasskeySettings() {
  const supported = usePasskeySupport();
  const session = useSyncExternalStore(subscribeToAuthSession, getAuthSessionSnapshot, () => null);
  const accessToken = session?.accessToken;
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supported || !accessToken) return;
    let active = true;
    void listPasskeys().then(result => { if (active) setPasskeys(result); }).catch(() => {
      if (active) setError("Could not load your passkeys.");
    });
    return () => { active = false; };
  }, [accessToken, supported]);

  async function update(operation?: { kind: "add" } | { kind: "remove"; id: string }) {
    if (!accessToken || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (operation?.kind === "add") {
        if (!await addPasskey(password)) return;
        setNotice("Passkey added.");
      } else if (operation?.kind === "remove") {
        await removePasskey(operation.id, password);
        setNotice("Passkey removed.");
      }
      setPasskeys(await listPasskeys());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your passkeys.");
    } finally {
      if (operation) setPassword("");
      setBusy(false);
    }
  }

  if (!supported) return null;
  const action = "min-h-12 rounded-lg border border-[var(--border)] px-3 font-semibold disabled:opacity-60";
  return <section className="mx-4 mb-4 space-y-3 rounded-lg border border-[var(--border)] bg-white p-4 text-sm">
    <h2 className="text-base font-bold">Passkeys</h2>
    <p>Use a passkey for passwordless sign-in. Confirm your password to add or remove one.</p>
    <label className="block font-semibold">Current password for passkeys
      <input className="mt-1 block w-full rounded-lg border border-[var(--border)] p-3 text-base" type="password" autoComplete="current-password"
        value={password} onChange={event => setPassword(event.target.value)} />
    </label>
    <button className={action} type="button" disabled={busy || !password} onClick={() => void update({ kind: "add" })}>Add a passkey</button>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {passkeys === null && error && <button className={action} type="button" disabled={busy} onClick={() => void update()}>Retry loading passkeys</button>}
    {passkeys?.map(passkey => <div className="flex flex-wrap items-center justify-between gap-2" key={passkey.id}>
      <span>Added {new Date(passkey.createdAt).toLocaleString()}</span>
      <button className={action} type="button" disabled={busy || !password} onClick={() => {
        if (window.confirm("Remove this passkey from your Spndrr account?")) void update({ kind: "remove", id: passkey.id });
      }}>Remove</button>
    </div>)}
  </section>;
}
