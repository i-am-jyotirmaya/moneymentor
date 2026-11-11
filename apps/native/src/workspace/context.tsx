import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession } from '../auth/session';
import type { HouseholdDashboard, MonthlyDashboardResponse } from '../api/workspace-models';
import type { UserSettings } from '../api/models';
import { getCurrentMonthKey } from '../lib/format';

function useWorkspaceState() {
  const { client, session } = useSession();
  const userId = session?.user.id;
  const consent = session?.requiresPrivacyConsent;
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [households, setHouseholds] = useState<HouseholdDashboard | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([userId, consent, householdId, month, attempt]);
  const [result, setResult] = useState<{ key: string; dashboard: MonthlyDashboardResponse | null; error: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    if (!userId || consent) return;
    void (async () => {
      try {
        const [settings, result] = await Promise.all([client.settings(), client.households()]);
        const scope = result.households.some(h => h.id === householdId) ? householdId! : result.defaultHouseholdId;
        const data = await client.monthlyDashboard({ month, householdId: scope });
        if (!current) return;
        setSettings(settings);
        setHouseholds(result);
        setResult({ key: requestKey, dashboard: data, error: null });
      } catch (caught) {
        if (current) setResult({ key: requestKey, dashboard: null, error: caught instanceof Error ? caught.message : 'Could not load your workspace.' });
      }
    })();
    return () => { current = false; };
  }, [client, userId, consent, householdId, month, requestKey]);
  return { settings, dataRevision: attempt, households, householdId: householdId ?? households?.defaultHouseholdId ?? null, setHouseholdId, month, setMonth,
    // Keyed results hide stale totals immediately, including before effects run.
    dashboard: result?.key === requestKey ? result.dashboard : null,
    loading: result?.key !== requestKey,
    error: result?.key === requestKey ? result.error : null,
    retry: () => setAttempt(n => n + 1) };
}
const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceState> | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return <WorkspaceContext.Provider value={state}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
