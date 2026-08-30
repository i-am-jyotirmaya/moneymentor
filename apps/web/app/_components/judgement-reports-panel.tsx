"use client";

import {
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  JudgementReport,
  JudgementReportCadence,
  JudgementReportMetric,
  JudgementReportObservation,
  JudgementReportScope,
  SummaryMetricCode,
} from "@/lib/api";
import {
  ApiError,
  getJudgementReport,
  listActiveJudgements,
  listJudgementReportHistory,
} from "@/lib/api";

type JudgementReportsPanelProps = {
  accessToken: string;
  householdId: string | null;
  allowHouseholdScope: boolean;
};

const featuredMetrics: SummaryMetricCode[] = [
  "OperatingSurplus",
  "ConsumptionSpend",
  "SavingsRate",
  "Income",
];

const rateMetrics = new Set<SummaryMetricCode>([
  "SavingsRate",
  "SavingsAllocationRate",
  "ExpenseToIncomeRate",
  "EssentialShare",
  "DiscretionaryShare",
  "DebtShare",
  "UncategorizedShare",
]);

export function JudgementReportsPanel({
  accessToken,
  householdId,
  allowHouseholdScope,
}: JudgementReportsPanelProps) {
  const [cadence, setCadence] = useState<JudgementReportCadence>("Weekly");
  const [scope, setScope] = useState<JudgementReportScope>("Personal");
  const [report, setReport] = useState<JudgementReport | null>(null);
  const [history, setHistory] = useState<JudgementReport[]>([]);
  const [activeFindings, setActiveFindings] = useState<JudgementReportObservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveScope = allowHouseholdScope ? scope : "Personal";

  useEffect(() => {
    if (!householdId) {
      return;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      const request = { householdId, scope: effectiveScope, cadence };
      void Promise.all([
        getJudgementReport(accessToken, request).catch((caughtError: unknown) => {
          if (caughtError instanceof ApiError && caughtError.status === 404) {
            return null;
          }
          throw caughtError;
        }),
        listJudgementReportHistory(accessToken, { ...request, limit: 12 }),
        listActiveJudgements(accessToken, request),
      ])
        .then(([latest, reportHistory, findings]) => {
          if (!active) return;
          const allReports = latest && !reportHistory.some((item) => item.id === latest.id)
            ? [latest, ...reportHistory]
            : reportHistory;
          setReport(latest ?? allReports[0] ?? null);
          setHistory(allReports);
          setActiveFindings(findings);
        })
        .catch((caughtError: unknown) => {
          if (!active) return;
          setReport(null);
          setHistory([]);
          setActiveFindings([]);
          setError(apiErrorMessage(caughtError));
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [accessToken, cadence, effectiveScope, householdId]);

  const currentHistoryIndex = report
    ? history.findIndex((candidate) => candidate.id === report.id)
    : -1;
  const metrics = featuredMetrics
    .map((code) => report?.metrics.find((metric) => metric.code === code))
    .filter((metric): metric is JudgementReportMetric => Boolean(metric));
  const categoryChanges = useMemo(
    () => [...(report?.categories ?? [])]
      .filter((category) => category.isMaterial || category.baselineTrend === "NewActivity")
      .sort((left, right) => Math.abs(right.baselineDeltaAmount ?? 0) - Math.abs(left.baselineDeltaAmount ?? 0))
      .slice(0, 4),
    [report],
  );

  async function selectPeriod(period: string) {
    if (!householdId || period === report?.period) return;
    setIsLoading(true);
    setError(null);
    try {
      setReport(await getJudgementReport(accessToken, { householdId, scope: effectiveScope, cadence, period }));
    } catch (caughtError) {
      setError(apiErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }

  function movePeriod(offset: number) {
    const target = history[currentHistoryIndex + offset];
    if (target) void selectPeriod(target.period);
  }

  return (
    <section aria-busy={isLoading} className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Completed periods only</p>
          <h2 className="text-3xl font-semibold tracking-normal">Financial reports</h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            Deterministic comparisons, with AI used only for wording.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SegmentedControl
            label="Cadence"
            onChange={(value) => setCadence(value as JudgementReportCadence)}
            options={["Weekly", "Monthly"]}
            value={cadence}
          />
          {allowHouseholdScope ? (
            <SegmentedControl
              label="Scope"
              onChange={(value) => setScope(value as JudgementReportScope)}
              options={["Personal", "Household"]}
              value={effectiveScope}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {!report ? (
        <div className="rounded-lg border border-[var(--border)] bg-white p-8 text-center shadow-sm">
          <Clock3 className="mx-auto h-7 w-7 text-[var(--accent)]" />
          <h3 className="mt-3 text-lg font-semibold">{isLoading ? "Loading report" : "No completed report yet"}</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {isLoading ? "Fetching persisted reporting data." : "The first report will appear after a completed period is processed."}
          </p>
        </div>
      ) : (
        <>
          <ReportHeader
            activeCount={activeFindings.length}
            report={report}
            isLoading={isLoading}
            canGoNewer={currentHistoryIndex > 0}
            canGoOlder={currentHistoryIndex >= 0 && currentHistoryIndex < history.length - 1}
            history={history}
            onGoNewer={() => movePeriod(-1)}
            onGoOlder={() => movePeriod(1)}
            onSelectPeriod={(period) => void selectPeriod(period)}
          />

          <ReportStateBanner report={report} />

          {report.dataQualityFlags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Data quality indicators">
              {report.dataQualityFlags.map((flag) => (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700" key={flag}>
                  {humanize(flag)}
                </span>
              ))}
            </div>
          ) : null}

          {activeFindings.length > 0 ? (
            <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Active focus areas</h3>
                <span className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs font-bold text-[var(--muted)]">
                  {activeFindings.length} active
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {activeFindings
                  .slice()
                  .sort((left, right) => right.severityRank - left.severityRank)
                  .map((finding) => <FindingCard finding={finding} key={finding.id} />)}
              </div>
            </article>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <ReportMetricCard currencyCode={report.currencyCode} key={metric.code} metric={metric} />
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
              <h3 className="text-lg font-semibold">What changed</h3>
              {report.narration?.overview ? (
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{report.narration.overview}</p>
              ) : null}
              <div className="mt-4 grid gap-3">
                {categoryChanges.length > 0 ? categoryChanges.map((category) => {
                  const delta = category.baselineDeltaAmount;
                  const Icon = category.direction === "Negative"
                    ? TrendingUp
                    : category.direction === "Positive"
                      ? TrendingDown
                      : BarChart3;
                  const directionClass = category.direction === "Negative"
                    ? "text-rose-700"
                    : category.direction === "Positive"
                      ? "text-emerald-700"
                      : "text-slate-600";
                  return (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3" key={category.subjectKey}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{category.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {category.baselineTrend === "NewActivity" ? "New activity" : "Compared with your historical median"}
                        </p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 text-sm font-bold ${directionClass}`}>
                        <Icon className="h-4 w-4" />
                        {delta === null ? formatMoney(category.amount, report.currencyCode) : formatSignedMoney(delta, report.currencyCode)}
                      </span>
                    </div>
                  );
                }) : <EmptyReportText text="No material category change was classified for this period." />}
              </div>
            </article>

            <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Report findings and actions</h3>
                <span className="rounded-md bg-[var(--surface)] px-2 py-1 text-xs font-bold text-[var(--muted)]">
                  {activeFindings.length} active
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {report.judgements.length > 0 ? report.judgements
                  .slice()
                  .sort((left, right) => right.severityRank - left.severityRank)
                  .map((finding) => <FindingCard finding={finding} key={finding.id} />)
                  : <EmptyReportText text="No findings were produced for this report." />}
              </div>
              {(report.narration?.actions.length ?? 0) > 0 ? (
                <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  <p className="text-sm font-semibold">Suggested next steps</p>
                  <ul className="mt-2 space-y-2 text-sm text-[var(--muted)]">
                    {report.narration!.actions.map((action) => <li key={action}>• {action}</li>)}
                  </ul>
                </div>
              ) : null}
            </article>
          </div>
        </>
      )}
    </section>
  );
}

function SegmentedControl({ label, onChange, options, value }: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <fieldset className="flex rounded-lg border border-[var(--border)] bg-white p-1" aria-label={label}>
      {options.map((option) => (
        <button
          aria-pressed={option === value}
          className={`rounded-md px-3 py-2 text-xs font-bold ${option === value ? "bg-[var(--ink)] text-white" : "text-[var(--muted)]"}`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </fieldset>
  );
}

function ReportHeader({
  activeCount,
  canGoNewer,
  canGoOlder,
  history,
  isLoading,
  onGoNewer,
  onGoOlder,
  onSelectPeriod,
  report,
}: {
  activeCount: number;
  canGoNewer: boolean;
  canGoOlder: boolean;
  history: JudgementReport[];
  isLoading: boolean;
  onGoNewer: () => void;
  onGoOlder: () => void;
  onSelectPeriod: (period: string) => void;
  report: JudgementReport;
}) {
  const directionClasses = report.direction === "Improved"
    ? "bg-emerald-50 text-emerald-700"
    : report.direction === "Worsened"
      ? "bg-rose-50 text-rose-700"
      : "bg-slate-100 text-slate-700";
  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-1 text-xs font-bold ${directionClasses}`}>
              {humanize(report.direction)}
            </span>
            <span className="text-xs font-semibold text-[var(--muted)]">{activeCount} active findings</span>
          </div>
          <h3 className="mt-2 text-xl font-semibold">{report.narration?.headline ?? `${report.cadence} report`}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDate(report.startDate)} – {formatEndDate(report.endDateExclusive)} · {report.timeZone} · revision {report.revision}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Older report" className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] disabled:opacity-40" disabled={!canGoOlder || isLoading} onClick={onGoOlder} type="button">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select aria-label="Report period" className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold" onChange={(event) => onSelectPeriod(event.target.value)} value={report.period}>
            {history.map((item) => <option key={item.id} value={item.period}>{item.period}</option>)}
          </select>
          <button aria-label="Newer report" className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--border)] disabled:opacity-40" disabled={!canGoNewer || isLoading} onClick={onGoNewer} type="button">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function ReportStateBanner({ report }: { report: JudgementReport }) {
  if (report.isProcessingUpdate || report.status === "AwaitingNarration" || report.narrationStatus === "Pending") {
    return <StateBanner icon={Clock3} text="Updated calculations are ready. Narration is still processing." tone="processing" />;
  }
  if (report.narrationStatus === "Fallback" || report.narration?.isDeterministicFallback) {
    return <StateBanner icon={CheckCircle2} text="Deterministic wording is shown because AI narration was unavailable or not authorized." tone="fallback" />;
  }
  if (report.direction === "InsufficientData") {
    return <StateBanner icon={BarChart3} text={`Insufficient comparison history. ${report.baselinePeriodsUsed} baseline periods were usable.`} tone="fallback" />;
  }
  return null;
}

function StateBanner({ icon: Icon, text, tone }: { icon: typeof Clock3; text: string; tone: "processing" | "fallback" }) {
  return (
    <p className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold ${tone === "processing" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700"}`} role="status">
      <Icon className="h-4 w-4 shrink-0" /> {text}
    </p>
  );
}

function ReportMetricCard({ currencyCode, metric }: { currencyCode: string; metric: JudgementReportMetric }) {
  const isRate = rateMetrics.has(metric.code);
  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{humanize(metric.code)}</p>
      <p className="mt-3 text-2xl font-semibold">{formatMetric(metric.current, currencyCode, isRate)}</p>
      <div className="mt-3 space-y-1 text-xs font-medium text-[var(--muted)]">
        <p>Previous: {formatDelta(metric.previousDelta, currencyCode, isRate)}</p>
        <p>Median: {formatDelta(metric.baselineDelta, currencyCode, isRate)}</p>
      </div>
    </article>
  );
}

function FindingCard({ finding }: { finding: JudgementReportObservation }) {
  const statusClass = finding.status === "Resolved"
    ? "bg-emerald-50 text-emerald-700"
    : finding.status === "Active"
      ? "bg-rose-50 text-rose-700"
      : "bg-slate-100 text-slate-700";
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{finding.title}</p>
        <div className="flex gap-2">
          <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[var(--muted)]">{finding.severity}</span>
          <span className={`rounded-md px-2 py-1 text-xs font-bold ${statusClass}`}>{humanize(finding.status)}</span>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{finding.message}</p>
      {finding.value ? <p className="mt-2 text-sm font-bold">{finding.value}</p> : null}
      {finding.actionCode ? <p className="mt-2 text-xs font-semibold text-[var(--accent)]">Action: {humanize(finding.actionCode)}</p> : null}
    </div>
  );
}

function EmptyReportText({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">{text}</p>;
}

function formatMetric(value: number | null, currencyCode: string, isRate: boolean) {
  if (value === null) return "Not available";
  return isRate ? `${value.toFixed(1)}%` : formatMoney(value, currencyCode);
}

function formatDelta(value: number | null, currencyCode: string, isRate: boolean) {
  if (value === null) return "Not available";
  const prefix = value > 0 ? "+" : "";
  return isRate ? `${prefix}${value.toFixed(1)} points` : `${prefix}${formatMoney(value, currencyCode)}`;
}

function formatSignedMoney(value: number, currencyCode: string) {
  return `${value > 0 ? "+" : ""}${formatMoney(value, currencyCode)}`;
}

function formatMoney(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currencyCode, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatEndDate(endDateExclusive: string) {
  const date = new Date(`${endDateExclusive}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return endDateExclusive;
  date.setUTCDate(date.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function apiErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.errors.join(" ")
    : "Could not load persisted financial reports.";
}
