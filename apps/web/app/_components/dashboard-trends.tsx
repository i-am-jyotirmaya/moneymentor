"use client";

import { useState } from "react";
import type { MonthlyDashboardResponse } from "@/lib/api";
import { useMonthlyTrend, type TrendMonth, type TrendRange } from "../_hooks/use-monthly-trend";
import { formatMoney } from "./workspace-format";
import styles from "./dashboard-trends.module.css";

const chartWidth = 480;
const plotLeft = 68;
const plotWidth = chartWidth - plotLeft;
const plotTop = 12;
const plotBottom = 132;
const chartHeight = 158;
const shortMonth = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });
const fullMonth = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

function monthDate(month: string) {
  return new Date(`${month}-01T00:00:00Z`);
}

function chartAxis(min: number, max: number) {
  return (value: number) => plotBottom - (value - min) / (max - min) * (plotBottom - plotTop);
}

function compactCurrency(currency: string) {
  try {
    const formatter = new Intl.NumberFormat("en-IN", {
      style: "currency", currency, notation: "compact", maximumFractionDigits: 1,
    });
    return (value: number) => formatter.format(value).replace(/^-/, "−");
  } catch {
    return (value: number) => formatMoney(value, currency);
  }
}

function ChartGrid({ min, max, y, format, months }: {
  min: number;
  max: number;
  y: (value: number) => number;
  format: (value: number) => string;
  months: TrendMonth[];
}) {
  const slot = plotWidth / months.length;
  const ticks = min < 0 ? [max, 0, min] : [max, max / 2, 0];
  return (
    <g>
      {ticks.map((value) => (
        <g key={value}>
          <text x={plotLeft - 8} y={y(value)} dominantBaseline="middle" textAnchor="end">{format(value)}</text>
          <line className={styles.gridline} x1={plotLeft} x2={chartWidth} y1={y(value)} y2={y(value)} />
        </g>
      ))}
      {months.map(({ month }, index) => {
        if (months.length > 6 && index % 2 === 0) return null;
        return (
          <text key={month} x={plotLeft + (index + 0.5) * slot} y={152} textAnchor="middle">
            {shortMonth.format(monthDate(month))}
          </text>
        );
      })}
    </g>
  );
}

function CashFlowChart({ months }: { months: TrendMonth[] }) {
  const allValues = months.flatMap(({ values }) => values ? [values.income, values.spends] : []);
  const min = Math.min(0, ...allValues);
  const max = Math.max(1, ...allValues);
  const y = chartAxis(min, max);
  const slot = plotWidth / months.length;
  const baseline = y(0);
  const barWidth = Math.min(14, slot * 0.26);
  const currency = months.at(-1)?.values?.currencyCode ?? "INR";

  return (
    <svg aria-hidden="true" className={styles.plot} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
      <ChartGrid min={min} max={max} y={y} format={compactCurrency(currency)} months={months} />
      {months.map(({ month, values }, index) => {
        const x = plotLeft + (index + 0.5) * slot;
        if (!values || (values.income === 0 && values.spends === 0)) {
          return <line className={styles.gridline} key={month} x1={x - 5} x2={x + 5} y1={baseline - 1} y2={baseline - 1} />;
        }
        return [values.income, values.spends].map((value, series) => {
          if (value === 0) return null;
          const end = y(value);
          return (
            <rect key={`${month}-${series}`} className={series ? styles.spending : styles.income}
              x={series ? x + 2 : x - 2 - barWidth} y={Math.min(end, baseline)}
              width={barWidth} height={Math.max(2, Math.abs(end - baseline))} rx="2" />
          );
        });
      })}
    </svg>
  );
}

function SavingsChart({ months }: { months: TrendMonth[] }) {
  const rates = months.flatMap(({ values }) => values?.savingsRate == null ? [] : [values.savingsRate]);
  if (rates.length < 2) {
    return <p className={styles.empty}>The trend appears after two months with recorded income.</p>;
  }

  const min = Math.min(0, ...rates);
  const max = Math.max(25, ...rates);
  const y = chartAxis(min, max);
  const slot = plotWidth / months.length;
  const baseline = y(0);
  const segments: { x: number; y: number; deficit: boolean }[][] = [];
  let segment: (typeof segments)[number] = [];
  for (const [index, { values }] of months.entries()) {
    if (values?.savingsRate == null) {
      segment = [];
      continue;
    }
    if (segment.length === 0) segments.push(segment);
    segment.push({ x: plotLeft + (index + 0.5) * slot, y: y(values.savingsRate), deficit: values.savingsRate < 0 });
  }

  return (
    <svg aria-hidden="true" className={styles.plot} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
      {baseline < plotBottom ? <rect className={styles.deficitArea} x={plotLeft} y={baseline} width={plotWidth} height={plotBottom - baseline} /> : null}
      <ChartGrid min={min} max={max} y={y} format={(value) => `${Math.round(value * 10) / 10}%`.replace(/^-/, "−")} months={months} />
      {segments.map((points) => {
        const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
        return (
          <g key={points[0].x}>
            {points.length > 1 ? <>
              <polygon className={styles.savingsArea} points={`${line} ${points.at(-1)!.x},${baseline} ${points[0].x},${baseline}`} />
              <polyline className={styles.savingsLine} points={line} />
            </> : null}
            {points.map(({ x, y, deficit }) =>
              <circle key={x} className={deficit ? styles.deficit : styles.spending} cx={x} cy={y} r="3.5" />,
            )}
          </g>
        );
      })}
    </svg>
  );
}

function rateText(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${rate < 0 ? "−" : ""}${Math.abs(rate)}%${rate < 0 ? " deficit" : ""}`;
}

export function DashboardTrends({ accessToken, householdId, dashboard, isLoading }: {
  accessToken: string;
  householdId: string | null;
  dashboard: MonthlyDashboardResponse;
  isLoading: boolean;
}) {
  const [range, setRange] = useState<TrendRange>(6);
  const { months, loading } = useMonthlyTrend(accessToken, householdId, dashboard, range, !isLoading);
  const available = months.some(({ values }) => values && (values.income !== 0 || values.spends !== 0));

  return (
    <section className={styles.trends} aria-label="Monthly trends">
      <article className={styles.card}>
        <header className={styles.heading}>
          <div><h2>Cash flow</h2><p>Income vs. spending</p></div>
          <fieldset className={styles.ranges}>
            <legend className="sr-only">Trend period</legend>
            {([6, 12] as const).map((count) => (
              <label key={count}>
                <input className="sr-only" type="radio" name="trend-range" checked={count === range} onChange={() => setRange(count)} />
                <span><span className="sr-only">{count} months</span><span aria-hidden="true">{count}M</span></span>
              </label>
            ))}
          </fieldset>
        </header>
        {loading ? <p className={styles.empty} role="status">Loading monthly trends…</p>
          : available ? <CashFlowChart months={months} />
          : <p className={styles.empty}>No income or spending recorded in this period.</p>}
        {!loading && available ? <ul className={styles.legend}>
          <li><span className={styles.income} />Income</li>
          <li><span className={styles.spending} />Spending</li>
        </ul> : null}
      </article>
      <article className={styles.card}>
        <header className={styles.heading}><div><h2>Savings rate</h2><p>Share of income kept</p></div></header>
        {loading ? <p className={styles.empty}>Loading…</p> : <SavingsChart months={months} />}
      </article>
      {!loading ? <details className={styles.values}>
        <summary>View monthly values</summary>
        <div className={styles.tableScroll}>
          <table>
            <caption className="sr-only">Income, spending and savings rate by month</caption>
            <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Savings rate</th></tr></thead>
            <tbody>{months.map(({ month, values }) => (
              <tr key={month}>
                <th scope="row">{fullMonth.format(monthDate(month))}</th>
                {values ? <>
                  <td>{formatMoney(values.income, values.currencyCode)}</td>
                  <td>{formatMoney(values.spends, values.currencyCode)}</td>
                  <td>{rateText(values.savingsRate)}</td>
                </> : <td colSpan={3}>Unavailable</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details> : null}
    </section>
  );
}
