import { useSectionLoad, useSections } from './sections';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useSession } from '../auth/session';
import { getCurrentMonthKey } from '../lib/format';

function useWorkspaceState() {
  const { retry: retrySections } = useSections();
  const { client, session } = useSession();
  const userId = session?.user.id;
  const consent = session?.requiresPrivacyConsent;
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [month, setMonth] = useState(getCurrentMonthKey);
  const [attempt, setAttempt] = useState(0);
  const section = useSectionLoad('workspace', JSON.stringify(['workspace', userId, householdId, month]), async () => {
    const [settings, households] = await Promise.all([client.settings(), client.households()]);
    const scope = households.households.some(h => h.id === householdId) ? householdId! : households.defaultHouseholdId;
    const dashboard = await client.monthlyDashboard({ month, householdId: scope });
    return { settings, households, dashboard };
  }, () => false, !!userId && !consent);
  const settings = section.data?.settings ?? null;
  const households = section.data?.households ?? null;
  return { settings, dataRevision: attempt, households, householdId: householdId ?? households?.defaultHouseholdId ?? null, setHouseholdId, month, setMonth,
    dashboard: section.data?.dashboard ?? null, loading: section.loading,
    error: section.failure?.message ?? null, section,
    retry: () => { setAttempt(n => n + 1); retrySections(); } };

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
