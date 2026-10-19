import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { decodeComposerDraft, emptyDraft, type ComposerDraft, type EntryResources, type FinanceClient, type ManualDraft, type Transaction } from '@spndrr/finance-core';
import type { SecureJsonStore } from '../services/secure-json';
import { ErrorNotice, Loading, styles } from '../ui/primitives';

export type EntryContextValue = {
  client: FinanceClient; resources: EntryResources; draft: ComposerDraft; busy: boolean;
  persistenceError: string | null; saved: Transaction | null; reply: string | null;
  edit: { transaction: Transaction; manual: ManualDraft } | null;
  update: (change: Partial<ComposerDraft>) => void; updateManual: (change: Partial<ManualDraft>, target?: 'manual' | 'edit') => void;
  persist: (next?: ComposerDraft) => Promise<void>; runExclusive: (work: () => Promise<void>) => Promise<void>;
  complete: (transaction: Transaction) => Promise<void>; setReply: (reply: string | null) => void;
  beginEdit: (transaction: Transaction) => void; clearEdit: () => void; setSaved: (transaction: Transaction | null) => void;
  clearForLogout: () => Promise<void>;
  discardDraft: () => Promise<void>;
};
export const EntryContext = createContext<EntryContextValue | null>(null);
export function useEntry() { const context = useContext(EntryContext); if (!context) throw Error('Missing native entry provider.'); return context; }
export function EntryProvider({ children, ownerId, resources, client, vault }: {
  children: ReactNode; ownerId: string; resources: EntryResources; client: FinanceClient; vault: SecureJsonStore;
}) {
  const initial = useMemo<ComposerDraft>(() => ({ version: 1, ownerId, manual: emptyDraft(resources.settings, resources.today), text: '', pendingManual: null, assistantUncertain: false }), [ownerId, resources.settings, resources.today]);
  const [draft, setDraft] = useState(initial);
  const current = useRef(draft);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [saved, setSaved] = useState<Transaction | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [edit, setEdit] = useState<EntryContextValue['edit']>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closed = useRef(false);
  const resetting = useRef(false);

  useEffect(() => {
    let alive = true;
    void vault.get().then(value => {
      const restored = decodeComposerDraft(value, ownerId);
      if (value !== null && !restored) throw Error('The draft format could not be restored.');
      if (alive && restored) { current.current = restored; setDraft(restored); }
    }).catch(() => { if (alive) { setRestoreError(true); setPersistenceError('Your encrypted draft could not be restored. Retry before entering another transaction.'); } })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [ownerId, vault]);
  const persist = useCallback(async (next?: ComposerDraft) => {
    if (timer.current) clearTimeout(timer.current);
    if (closed.current) throw Error('This session is closed.');
    if (resetting.current) return;
    try { await vault.put(next ?? current.current); setPersistenceError(null); }
    catch { setPersistenceError('Your draft could not be saved securely. Free device storage and try again.'); throw Error('Secure draft storage is unavailable.'); }
  }, [vault]);
  const update = useCallback((change: Partial<ComposerDraft>) => {
    if (closed.current || resetting.current) return;
    const next = { ...current.current, ...change };
    current.current = next; setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persist().catch(() => undefined); }, 300);
  }, [persist]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active' && ready && !closed.current) void persist().catch(() => undefined);
    });
    return () => { listener.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [persist, ready]);

  const value: EntryContextValue = {
    client, resources, draft, busy, persistenceError, saved, reply, edit, update, persist, setReply, setSaved,
    updateManual: (change, target = 'manual') => {
      if (target === 'edit') setEdit(previous => previous ? { ...previous, manual: { ...previous.manual, ...change } } : null);
      else if (!current.current.pendingManual) update({ manual: { ...current.current.manual, ...change } });
    },
    runExclusive: async work => {
      if (busyRef.current || closed.current) return;
      busyRef.current = true; setBusy(true);
      try { await work(); } finally { busyRef.current = false; setBusy(false); }
    },
    complete: async transaction => {
      setSaved(transaction); setReply(null);
      // Keep the confirmed reference durable until clearing succeeds.
      if (timer.current) clearTimeout(timer.current);
      resetting.current = true;
      try { await vault.remove(); setPersistenceError(null); }
      catch { setPersistenceError('The transaction is saved, but its local draft could not be cleared.'); return; }
      finally { resetting.current = false; }
      current.current = initial; setDraft(initial);
    },
    discardDraft: async () => {
      if (timer.current) clearTimeout(timer.current);
      resetting.current = true;
      try { await vault.remove(); current.current = initial; setDraft(initial); setReply(null); setPersistenceError(null); }
      catch { setPersistenceError('Your pending draft could not be cleared securely.'); }
      finally { resetting.current = false; }
    },
    beginEdit: transaction => {
      setEdit({ transaction, manual: { eventKind: transaction.type === 'Income' ? 'Income' : 'Purchase',
        amount: String(transaction.amount), date: transaction.transactionDate.slice(0, 10), accountId: transaction.accountId ?? null,
        categoryId: transaction.categoryId ?? null, merchant: transaction.merchantName ?? '', description: transaction.description ?? '',
        sourceText: transaction.sourceText, paymentChannel: transaction.paymentChannel ?? 'Unknown', visibility: transaction.visibility } });
    },
    clearEdit: () => setEdit(null),
    clearForLogout: async () => {
      closed.current = true;
      if (timer.current) clearTimeout(timer.current);
      await vault.closeAndRemove();
    },
  };
  if (!ready) return <Loading label="Restoring your draft…" />;
  if (restoreError) return <View style={styles.center}><ErrorNotice message={persistenceError ?? 'Your encrypted draft is unavailable.'} onRetry={() => { setReady(false); void vault.get().then(value => {
    const restored = decodeComposerDraft(value, ownerId); if (value && !restored) throw Error();
    if (restored) { current.current = restored; setDraft(restored); } setPersistenceError(null); setRestoreError(false);
  }).catch(() => setPersistenceError('Your encrypted draft is still unavailable.')).finally(() => setReady(true)); }} /></View>;
  return <EntryContext.Provider value={value}>{children}</EntryContext.Provider>;
}
