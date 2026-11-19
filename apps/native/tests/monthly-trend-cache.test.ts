import { act, createElement, type ReactElement } from 'react';
import type { MonthlyDashboardResponse } from '../src/api/workspace-models';
import { useSession } from '../src/auth/session';
import { useWorkspace } from '../src/workspace/context';
import {
  clearMonthlyCache,
  CURRENT_MONTH_STALE_MS,
  fetchMonthly,
  isStale,
  PAST_MONTH_STALE_MS,
  primeMonthly,
  toTrendPoint,
  trendMonthKeys,
  useMonthlyTrend,
} from '../src/workspace/monthly-trend';

jest.mock('../src/auth/session', () => ({ useSession: jest.fn() }));
jest.mock('../src/workspace/context', () => ({ useWorkspace: jest.fn() }));

const now = Date.UTC(2026, 10, 19, 12);
const currentMonth = '2026-11';
const pastMonth = '2026-10';
const householdId = 'home';

function monthlyDashboard(month: string | undefined) {
  return { month, income: 1000, spends: 600, saved: 400, savingsRate: 40 } as MonthlyDashboardResponse;
}

function makeClient() {
  return {
    monthlyDashboard: jest.fn(async ({ month }: { month?: string; householdId?: string }) => monthlyDashboard(month)),
  };
}

beforeEach(() => {
  clearMonthlyCache();
  jest.useFakeTimers({ now });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('fetches and caches each month once for the household', async () => {
  const client = makeClient();
  const keys = trendMonthKeys(currentMonth, 6);
  expect(keys).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', pastMonth, currentMonth]);

  const load = () => Promise.all(keys.map(month => fetchMonthly(client, householdId, month)));
  const first = await load();
  const second = await load();

  expect(first.map(data => data?.month)).toEqual(keys);
  second.forEach((data, index) => expect(data).toBe(first[index]));
  expect(client.monthlyDashboard.mock.calls).toEqual(keys.map(month => [{ month, householdId }]));
});

test('expanding from six to twelve months fetches only the six missing months', async () => {
  const client = makeClient();
  await Promise.all(trendMonthKeys(currentMonth, 6).map(month => fetchMonthly(client, householdId, month)));
  client.monthlyDashboard.mockClear();

  const expanded = await Promise.all(
    trendMonthKeys(currentMonth, 12).map(month => fetchMonthly(client, householdId, month)),
  );

  const missing = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  expect(expanded.map(data => data?.month)).toEqual([...missing, ...trendMonthKeys(currentMonth, 6)]);
  expect(client.monthlyDashboard.mock.calls).toEqual(missing.map(month => [{ month, householdId }]));
});

test.each([
  [currentMonth, CURRENT_MONTH_STALE_MS],
  [pastMonth, PAST_MONTH_STALE_MS],
])('%s expires only after its staleness threshold', (month, staleMs) => {
  expect(isStale(month, now, now + staleMs)).toBe(false);
  expect(isStale(month, now, now + staleMs + 1)).toBe(true);
});

test('an unforced refresh refetches the current month once stale and keeps the fresh past month', async () => {
  const client = makeClient();
  const load = () => Promise.all([pastMonth, currentMonth].map(month => fetchMonthly(client, householdId, month)));
  const [past, current] = await load();
  client.monthlyDashboard.mockClear();

  jest.setSystemTime(now + CURRENT_MONTH_STALE_MS);
  expect(await load()).toEqual([past, current]);
  expect(client.monthlyDashboard).not.toHaveBeenCalled();

  jest.setSystemTime(now + CURRENT_MONTH_STALE_MS + 1);
  const [cachedPast, refreshedCurrent] = await load();

  expect(cachedPast).toBe(past);
  expect(refreshedCurrent).toEqual(current);
  expect(refreshedCurrent).not.toBe(current);
  expect(client.monthlyDashboard.mock.calls).toEqual([[{ month: currentMonth, householdId }]]);

  jest.setSystemTime(now + PAST_MONTH_STALE_MS + 1);
  const refreshedPast = await fetchMonthly(client, householdId, pastMonth);
  expect(refreshedPast).toEqual(past);
  expect(refreshedPast).not.toBe(past);
  expect(client.monthlyDashboard).toHaveBeenLastCalledWith({ month: pastMonth, householdId });
});

test('a forced refresh bypasses the fresh current-month cache', async () => {
  const client = makeClient();
  const first = await fetchMonthly(client, householdId, currentMonth);

  const refreshed = await fetchMonthly(client, householdId, currentMonth, true);

  expect(refreshed).toEqual(first);
  expect(refreshed).not.toBe(first);
  expect(await fetchMonthly(client, householdId, currentMonth)).toBe(refreshed);
  expect(client.monthlyDashboard).toHaveBeenCalledTimes(2);
});

test('concurrent calls, including a forced call, share the in-flight request', async () => {
  const client = makeClient();
  const data = monthlyDashboard(currentMonth);
  let resolveRequest!: (value: MonthlyDashboardResponse) => void;
  const request = new Promise<MonthlyDashboardResponse>(resolve => { resolveRequest = resolve; });
  client.monthlyDashboard.mockReturnValueOnce(request);

  const first = fetchMonthly(client, householdId, currentMonth);
  const second = fetchMonthly(client, householdId, currentMonth);
  const forced = fetchMonthly(client, householdId, currentMonth, true);

  expect(second).toBe(first);
  expect(forced).toBe(first);
  expect(client.monthlyDashboard).toHaveBeenCalledTimes(1);
  resolveRequest(data);
  expect(await Promise.all([first, second, forced])).toEqual([data, data, data]);
  expect(await fetchMonthly(client, householdId, currentMonth)).toBe(data);
  expect(client.monthlyDashboard).toHaveBeenCalledTimes(1);
});

test('a failed month yields a cached null stub and the other months still resolve', async () => {
  const client = makeClient();
  client.monthlyDashboard.mockImplementation(async ({ month }) => {
    if (month === pastMonth) throw new Error('Monthly dashboard unavailable');
    return monthlyDashboard(month);
  });

  const [older, failed, current] = await Promise.all(
    trendMonthKeys(currentMonth, 3).map(month => fetchMonthly(client, householdId, month)),
  );

  expect(older).toEqual(monthlyDashboard('2026-09'));
  expect(failed).toBeNull();
  expect(toTrendPoint(pastMonth, failed)).toMatchObject({
    income: null, spend: null, saved: null, savingsRate: null,
  });
  expect(current).toEqual(monthlyDashboard(currentMonth));
  expect(await fetchMonthly(client, householdId, pastMonth)).toBeNull();
  expect(await fetchMonthly(client, householdId, currentMonth)).toBe(current);
  expect(client.monthlyDashboard).toHaveBeenCalledTimes(3);
});

test('priming reuses the dashboard response under its month key', async () => {
  const client = makeClient();
  const dashboard = monthlyDashboard('2026-11-01');
  primeMonthly(householdId, dashboard);

  expect(await fetchMonthly(client, householdId, currentMonth)).toBe(dashboard);
  expect(client.monthlyDashboard).not.toHaveBeenCalled();
});

test('the same month is cached separately for different households', async () => {
  const client = makeClient();
  const otherHousehold = 'other-home';
  const results = await Promise.all([
    fetchMonthly(client, householdId, currentMonth),
    fetchMonthly(client, otherHousehold, currentMonth),
  ]);

  expect(results[0]).not.toBe(results[1]);
  expect(await fetchMonthly(client, householdId, currentMonth)).toBe(results[0]);
  expect(await fetchMonthly(client, otherHousehold, currentMonth)).toBe(results[1]);
  expect(client.monthlyDashboard.mock.calls).toEqual([
    [{ month: currentMonth, householdId }],
    [{ month: currentMonth, householdId: otherHousehold }],
  ]);
});

test('clearing the cache makes a previously cached month fetch again', async () => {
  const client = makeClient();
  const first = await fetchMonthly(client, householdId, currentMonth);

  clearMonthlyCache();

  expect(await fetchMonthly(client, householdId, currentMonth)).not.toBe(first);
  expect(client.monthlyDashboard).toHaveBeenCalledTimes(2);
});

test('the hook reuses the dashboard at revision zero and forces only the current month at revision one', async () => {
  // Resolve the renderer bundled with jest-expo so pnpm can find its transitive dependency.
  const rendererPath = require.resolve('test-renderer', { paths: [require.resolve('jest-expo/package.json')] });
  const { createRoot } = jest.requireActual<{
    createRoot: () => { render: (element: ReactElement) => void; unmount: () => void };
  }>(rendererPath);
  const root = createRoot();
  const client = makeClient();
  const dashboard = monthlyDashboard(currentMonth);
  jest.mocked(useSession).mockReturnValue({ client } as unknown as ReturnType<typeof useSession>);

  const workspace = { householdId, dashboard, month: currentMonth, dataRevision: 0 };
  jest.mocked(useWorkspace).mockReturnValue(workspace as ReturnType<typeof useWorkspace>);

  const onRender = jest.fn();
  function Trend() {
    onRender(useMonthlyTrend(2));
    return null;
  }

  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    await act(async () => { root.render(createElement(Trend)); });
    expect(client.monthlyDashboard.mock.calls).toEqual([[{ month: pastMonth, householdId }]]);
    expect(onRender).toHaveBeenLastCalledWith({
      months: [toTrendPoint(pastMonth, monthlyDashboard(pastMonth)), toTrendPoint(currentMonth, dashboard)],
      isLoading: false,
    });

    client.monthlyDashboard.mockClear();
    jest.mocked(useWorkspace).mockReturnValue({ ...workspace, dataRevision: 1 } as ReturnType<typeof useWorkspace>);
    await act(async () => { root.render(createElement(Trend)); });

    expect(client.monthlyDashboard.mock.calls).toEqual([[{ month: currentMonth, householdId }]]);
  } finally {
    try {
      await act(async () => { root.unmount(); });
    } finally {
      environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
  }
});
