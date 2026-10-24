import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SecureJsonStore } from '../services/secure-json';

type RunRecord = { goalId: string; runId: string; householdId: string };
type Records = Record<string, RunRecord>;
type PlanningRecords = { ready: boolean; error: string | null; records: Records; remember: (record: RunRecord) => Promise<void>; retry: () => void };
const Context = createContext<PlanningRecords | null>(null);
export function PlanningRunsProvider({ ownerId, vault, children }: { ownerId: string; vault: SecureJsonStore; children: ReactNode }) {
  const [records, setRecords] = useState<Records>({}); const current = useRef<Records>({});
  const [ready, setReady] = useState(false); const [error, setError] = useState<string | null>(null); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void vault.get().then(value => {
      const parsed = value as { version?: number; ownerId?: string; records?: Records } | null;
      if (parsed && (parsed.version !== 1 || parsed.ownerId !== ownerId || !parsed.records || Array.isArray(parsed.records)
        || Object.entries(parsed.records).some(([key, record]) => !record || key !== record.goalId || typeof record.runId !== 'string' || !record.runId || typeof record.householdId !== 'string'))) throw Error('Unrecognized saved planning runs.');
      if (alive) { current.current = parsed?.records ?? {}; setRecords(current.current); setReady(true); setError(null); }
    }).catch(() => { if (alive) setError('Saved plan progress could not be restored securely. Retry before starting another plan.'); });
    return () => { alive = false; };
  }, [ownerId, vault, attempt]);
  const remember = useCallback(async (record: RunRecord) => {
    const next = { ...current.current, [record.goalId]: record };
    await vault.put({ version: 1, ownerId, records: next });
    current.current = next; setRecords(next);
  }, [ownerId, vault]);
  return <Context.Provider value={{ ready, error, records, remember, retry: () => setAttempt(value => value + 1) }}>{children}</Context.Provider>;
}
export function usePlanningRecords() { const value = useContext(Context); if (!value) throw Error('Missing planning progress provider.'); return value; }
