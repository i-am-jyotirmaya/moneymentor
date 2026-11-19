// useMonthlyTrend per HANDOFF A1/A3 ("Trend data", Lead decision Nov 19): one /api/dashboard/monthly
// call per month, cached per (household, month); stale and failed months refetch.
// TODO(A3): HANDOFF specifies React Query `useQueries`; the app has no React Query yet, so this is a
// small module cache with the same key shape and return value. Swap the internals, keep the API.
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { MonthlyDashboardResponse } from '../api/workspace-models';
import { useSession } from '../auth/session';
import { formatMonthKey, getCurrentMonthKey, shiftMonthKey } from '../lib/format';
import { useWorkspace } from './context';

export type TrendPoint = { key: string; label: string; income: number | null; spend: number | null; saved: number | null; savingsRate: number | null };
type Entry = { data: MonthlyDashboardResponse | null; fetchedAt: number; failed?: boolean; promise?: Promise<MonthlyDashboardResponse | null> };

export const CURRENT_MONTH_STALE_MS = 30_000;
export const PAST_MONTH_STALE_MS = 6 * 60 * 60_000;
const cache = new Map<string, Entry>();

export function monthlyKey(householdId: string | null, month: string) {
  return JSON.stringify(['dashboard', 'monthly', householdId, month]);
}
/** Oldest → newest, ending at `anchor`. */
export function trendMonthKeys(anchor: string, months: number) {
  return Array.from({ length: months }, (_, i) => shiftMonthKey(anchor, i - months + 1));
}
export function shortMonthLabel(key: string) {
  return formatMonthKey(key).split(' ')[0].slice(0, 3);
}
export function toTrendPoint(key: string, data: MonthlyDashboardResponse | null): TrendPoint {
  return { key, label: shortMonthLabel(key), income: data?.income ?? null, spend: data?.spends ?? null, saved: data?.saved ?? null, savingsRate: data?.savingsRate ?? null };
}
export function isStale(month: string, fetchedAt: number, now: number, current = getCurrentMonthKey()) {
  return now - fetchedAt > (month >= current ? CURRENT_MONTH_STALE_MS : PAST_MONTH_STALE_MS);
}
/** Seeds the cache with data the screen already has (the dashboard's own monthly query). */
export function primeMonthly(householdId: string | null, data: MonthlyDashboardResponse) {
  cache.set(monthlyKey(householdId, data.month.slice(0, 7)), { data, fetchedAt: Date.now() });
}
export function clearMonthlyCache() { cache.clear(); }

type Client = { monthlyDashboard(input: { month?: string; householdId?: string }): Promise<MonthlyDashboardResponse> };
export function fetchMonthly(client: Client, householdId: string | null, month: string, force = false): Promise<MonthlyDashboardResponse | null> {
  const key = monthlyKey(householdId, month);
  const hit = cache.get(key);
  if (hit?.promise) return hit.promise;
  if (hit && !hit.failed && !force && !isStale(month, hit.fetchedAt, Date.now())) return Promise.resolve(hit.data);

  const request = async () => client.monthlyDashboard({ month, householdId: householdId ?? undefined });
  const promise: Promise<MonthlyDashboardResponse | null> = request().then(
    data => {
      if (cache.get(key)?.promise === promise) cache.set(key, { data, fetchedAt: Date.now() });
      return data;
    },
    () => {
      const entry = cache.get(key);
      if (entry?.promise === promise) {
        if (entry.data) cache.set(key, { data: entry.data, fetchedAt: entry.fetchedAt, failed: true });
        else cache.delete(key);
      }
      return entry?.data ?? hit?.data ?? null;
    },
  );
  cache.set(key, { data: hit?.data ?? null, fetchedAt: hit?.fetchedAt ?? 0, promise });
  return promise;
}

export function useMonthlyTrend(months: number, anchor?: string) {
  const { client } = useSession();
  const { householdId, dashboard, dataRevision, month } = useWorkspace();
  const end = anchor ?? month;
  const keys = useMemo(() => trendMonthKeys(end, months), [end, months]);
  const [state, setState] = useState<{ id: string; points: TrendPoint[] } | null>(null);
  const id = `${householdId}:${keys.join(',')}:${dataRevision}`;
  useEffect(() => {
    let alive = true;
    if (dashboard) primeMonthly(householdId, dashboard);
    function load(forceCurrent: boolean) {
      const current = getCurrentMonthKey();
      void Promise.all(keys.map(key => fetchMonthly(client, householdId, key, forceCurrent && key >= current))).then(results => {
        if (alive) setState({ id, points: keys.map((key, i) => toTrendPoint(key, results[i])) });
      });
    }
    load(dataRevision > 0);
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') load(false);
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [client, householdId, keys, id, dashboard, dataRevision]);
  const fresh = state?.id === id ? state.points : null;
  return { months: fresh ?? state?.points ?? keys.map(key => toTrendPoint(key, null)), isLoading: !fresh };
}
