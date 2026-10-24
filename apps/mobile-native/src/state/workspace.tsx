import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { workspaceApi, type HouseholdSummary, type UserSettings } from '@spndrr/finance-core';
import { useEntry } from './entry';
import { useOperations } from './operations';

type WorkspaceContextValue = { api: ReturnType<typeof workspaceApi>; household: HouseholdSummary | null; settings: UserSettings; switchHousehold: (household: HouseholdSummary) => void };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function WorkspaceProvider({ children, household, settings, onSwitch }: { children: ReactNode; household: HouseholdSummary | null; settings: UserSettings; onSwitch: (household: HouseholdSummary) => void }) {
  const { client } = useEntry();
  const value = useMemo(() => ({ api: workspaceApi(client), household, settings, switchHousehold: onSwitch }), [client, household, settings, onSwitch]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext); if (!value) throw Error('Missing workspace provider.');
  const entry = useEntry();
  return { ...value, scope: entry.resources.householdId, currency: entry.resources.settings.currencyCode, today: entry.resources.today };
}

/** Every feature mutation shares the durable unknown-outcome boundary and refreshes saved views. */
export function useWorkspaceMutation({ allowReadOnly = false }: { allowReadOnly?: boolean } = {}) {
  const entry = useEntry(); const operations = useOperations(); const query = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const blocked = operations.blocked || entry.busy || !!entry.draft.pendingManual || entry.draft.assistantUncertain || (!allowReadOnly && !entry.resources.canWrite);
  async function execute<T>(label: string, work: () => Promise<T>, onSuccess?: (result: T) => void | Promise<void>): Promise<T | undefined> {
    if (blocked) return undefined;
    setError(null);
    try {
      const result = await operations.guard.run(label, work, entry.resources.householdId);
      await onSuccess?.(result);
      await query.invalidateQueries();
      return result;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The change could not be confirmed. Refresh the saved data.'); return undefined; }
  }
  return { execute, error, setError, blocked, busy: operations.busy, refresh: () => query.refetchQueries({ type: 'active' }, { throwOnError: true }) };
}
