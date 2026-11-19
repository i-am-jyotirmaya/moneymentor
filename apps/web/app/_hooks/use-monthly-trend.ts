"use client";

import { useEffect, useMemo, useState } from "react";
import { getMonthlyDashboard, type MonthlyDashboardResponse } from "@/lib/api";

type TrendValues = Pick<MonthlyDashboardResponse, "income" | "spends" | "savingsRate" | "currencyCode">;
export type TrendMonth = { month: string; values: TrendValues | null };
export type TrendRange = 6 | 12;

const historyCacheMs = 5 * 60 * 1000;

function precedingMonths(month: string, range: TrendRange) {
  const [year, monthNumber] = month.split("-").map(Number);
  return Array.from({ length: range - 1 }, (_, index) =>
    new Date(Date.UTC(year, monthNumber - range + index, 1)).toISOString().slice(0, 7),
  );
}

function createHistory(accessToken: string, householdId: string | null) {
  const cache = new Map<string, { expires: number; request: Promise<TrendValues> }>();
  return {
    load(month: string) {
      const cached = cache.get(month);
      if (cached && cached.expires > Date.now()) return cached.request;

      const request = getMonthlyDashboard(accessToken, { month, householdId: householdId ?? undefined })
        .then((result) => {
          if (result.month !== month) throw new Error("Unexpected dashboard month");
          const { income, spends, savingsRate, currencyCode } = result;
          return { income, spends, savingsRate, currencyCode };
        })
        .catch((error: unknown) => {
          cache.delete(month);
          throw error;
        });
      cache.set(month, { expires: Date.now() + historyCacheMs, request });
      // Bound the cache as users navigate across multiple years.
      if (cache.size > 36) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return request;
    },
  };
}

export function useMonthlyTrend(
  accessToken: string,
  householdId: string | null,
  dashboard: MonthlyDashboardResponse,
  range: TrendRange,
  enabled: boolean,
) {
  const history = useMemo(() => createHistory(accessToken, householdId), [accessToken, householdId]);
  const months = useMemo(() => precedingMonths(dashboard.month, range), [dashboard.month, range]);
  const [completed, setCompleted] = useState<{
    history: typeof history;
    months: string[];
    entries: TrendMonth[];
  }>();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let index = 0;
    const entries: TrendMonth[] = [];

    async function loadMonths() {
      while (active && index < months.length) {
        const position = index++;
        const month = months[position];
        let values: TrendValues | null = null;
        try {
          values = await history.load(month);
        } catch {
          // An unavailable month is a gap, leaving successful results visible.
        }
        entries[position] = { month, values };
      }
    }

    void Promise.all([loadMonths(), loadMonths(), loadMonths()]).then(() => {
      if (active) setCompleted({ history, months, entries });
    });
    return () => { active = false; };
  }, [history, months, enabled]);

  const ready = enabled && completed?.history === history && completed.months === months;
  return {
    loading: !ready,
    months: [
      ...(ready ? completed.entries : months.map((month) => ({ month, values: null }))),
      { month: dashboard.month, values: dashboard },
    ].map((entry) => entry.values?.currencyCode === dashboard.currencyCode ? entry : { ...entry, values: null }),
  };
}
