"use client";

import { useEffect, useState, type FormEvent } from "react";
import { listFinancialAccounts, saveFinancialAccount, type FinancialAccount, type SaveFinancialAccount, type FinancialAccountType } from "@/lib/api";
import { Dropdown } from "./dropdown";
import { Field } from "./common-ui";

export function FinancialAccountsPanel({ accessToken, householdId, canWrite }: { accessToken: string; householdId: string | null; canWrite: boolean }) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | undefined>();
  const empty: SaveFinancialAccount = { householdId, name: "", accountType: "BankAccount", institution: null, last4: null, aliases: [], shared: false, isActive: true };
  const [form, setForm] = useState<SaveFinancialAccount>(empty);
  useEffect(() => {
    let cancelled = false;
    void listFinancialAccounts(accessToken, householdId).then(rows => { if (!cancelled) setAccounts(rows); })
      .catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : "Unable to load financial accounts."); });
    return () => { cancelled = true; };
  }, [accessToken, householdId]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null); setNotice(null);
    try {
      const account = await saveFinancialAccount(accessToken, { ...form, householdId, aliases: form.aliases.map(x => x.trim()).filter(Boolean) }, editing);
      setAccounts(rows => [...rows.filter(x => x.id !== account.id), account]);
      setForm(empty); setEditing(undefined); setNotice("Financial account saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save financial account."); }
    finally { setSaving(false); }
  }
  function edit(account: FinancialAccount) {
    setEditing(account.id); setForm({ householdId, name: account.name, accountType: account.accountType,
      institution: account.institution, last4: account.last4, aliases: account.aliases,
      shared: account.ownerUserProfileId === null, isActive: account.isActive });
    setNotice(null);
  }
  return <article className="mt-4 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
    <h2 className="text-xl font-semibold">Financial accounts</h2>
    <p className="mt-1 text-sm text-[var(--muted)]">Accounts are optional. Add bank, credit card, cash or wallet accounts and names you use in chat.</p>
    <div className="mt-4 space-y-2">
      {accounts.map(account => <div key={account.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
        <div><p className="font-semibold">{account.name}{account.last4 ? ` · ${account.last4}` : ""}</p>
          <p className="text-xs text-[var(--muted)]">{account.accountType} · {account.ownerUserProfileId ? "Private" : "Shared"}{!account.isActive ? " · Archived" : ""}{account.aliases.length ? ` · ${account.aliases.join(", ")}` : ""}</p></div>
        <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold" disabled={!canWrite || saving} onClick={() => edit(account)} type="button">Edit {account.name}</button>
      </div>)}
      {!accounts.length && <p className="text-sm text-[var(--muted)]">You can keep tracking without adding an account.</p>}
    </div>
    <form onSubmit={save} className="mt-5 grid gap-3 sm:grid-cols-2">
      <Field label="Account name"><input className="form-control" maxLength={128} required disabled={!canWrite || saving} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
      <Dropdown label="Account type" value={form.accountType} disabled={!canWrite || saving || !!editing} options={[
        { value: "BankAccount", label: "Bank account" }, { value: "CreditCard", label: "Credit card" }, { value: "Cash", label: "Cash" }, { value: "Wallet", label: "Wallet" },
      ]} onChange={value => setForm({ ...form, accountType: value as FinancialAccountType })} />
      <Field label="Institution (optional)"><input className="form-control" maxLength={128} disabled={!canWrite || saving} value={form.institution ?? ""} onChange={e => setForm({ ...form, institution: e.target.value || null })} /></Field>
      <Field label="Last four digits (optional)"><input className="form-control" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" disabled={!canWrite || saving} value={form.last4 ?? ""} onChange={e => setForm({ ...form, last4: e.target.value || null })} /></Field>
      <Field label="Aliases (comma separated)"><input className="form-control" disabled={!canWrite || saving} value={form.aliases.join(",")} onChange={e => setForm({ ...form, aliases: e.target.value.split(",") })} /></Field>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label><input type="checkbox" disabled={!canWrite || saving || !!editing} checked={form.shared} onChange={e => setForm({ ...form, shared: e.target.checked })} /> Shared account (owner/admin)</label>
        <label><input type="checkbox" disabled={!canWrite || saving} checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
      </div>
      <div className="flex gap-2"><button className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white" disabled={!canWrite || saving} type="submit">{saving ? "Saving…" : editing ? "Save account" : "Add account"}</button>
        {editing && <button type="button" className="rounded-lg border border-[var(--border)] px-3 py-2" onClick={() => { setEditing(undefined); setForm(empty); }}>Cancel</button>}</div>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
  </article>;
}
