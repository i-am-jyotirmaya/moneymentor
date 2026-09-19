"use client";
import { ProgressLink as Link } from "./navigation-progress";
import { useWorkspaceUrl } from "../_hooks/use-workspace-url";
import { SectionSkeleton } from "./loading-ui";

import type { MonthlyDashboardResponse } from "@/lib/api";
import { BarChart3, CircleDollarSign, ReceiptText, Wallet } from "lucide-react";
import {
  CategoryRow,
  EmptyInline,
  InsightCard,
  JudgementCard,
  MetricCard,
  MonthNavigator,
  TransactionsPanel,
} from "./common-ui";
import { formatMoney } from "./workspace-format";

export function DashboardSection({
  dashboard,
  isLoading,
  month,
  onMonthChange,
}: {
  dashboard: MonthlyDashboardResponse | null;
  isLoading: boolean;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const { params } = useWorkspaceUrl();
  const household = params.get("household");
  const query = household ? `?household=${encodeURIComponent(household)}` : "";
  if (!dashboard) {
    return <SectionSkeleton />;
  }

  return (
    <section
      aria-busy={isLoading}
      className="min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">
            {dashboard.monthLabel}
          </p>
          <h2 className="text-3xl font-semibold tracking-normal">Dashboard</h2>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            Your income, spending, and progress at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MonthNavigator
            disabled={isLoading}
            label="Dashboard month"
            month={month}
            onMonthChange={onMonthChange}
          />
        </div>
      </div>

      <nav aria-label="Dashboard actions" className="mb-5 flex flex-wrap gap-3">
        <Link href={`/assistant${query}`} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">Track a transaction</Link>
        <Link href={`/reports${query}`} className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold">Review reports</Link>
        <Link href={`/planning${query}`} className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold">Plan a goal</Link>
      </nav>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Income"
          value={formatMoney(dashboard.income, dashboard.currencyCode)}
          detail="Tracked income"
          tone="income"
        />
        <MetricCard
          icon={ReceiptText}
          label="Spends"
          value={formatMoney(dashboard.spends, dashboard.currencyCode)}
          detail="Tracked expenses"
          tone="spend"
        />
        <MetricCard
          icon={Wallet}
          label="Saved"
          value={formatMoney(dashboard.saved, dashboard.currencyCode)}
          detail={
            dashboard.savingsRate === null
              ? "Income not tracked"
              : `${dashboard.savingsRate}% savings rate`
          }
          tone="saved"
        />
        <MetricCard
          icon={BarChart3}
          label="Categories"
          value={dashboard.categories.length.toString()}
          detail="Spending categories"
          tone="neutral"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Category spending</h3>
              <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                Calculated from stored expenses.
              </p>
            </div>
            <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.categories.length > 0 ? (
              dashboard.categories.map((category) => (
                <CategoryRow
                  category={category}
                  currencyCode={dashboard.currencyCode}
                  key={category.name}
                  total={dashboard.spends}
                />
              ))
            ) : (
              <EmptyInline text="No expenses are tracked for this month yet." />
            )}
          </div>
        </article>

        <div className="grid gap-5">
          <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold">Judgements</h3>
            <div className="mt-4 grid gap-3">
              {dashboard.judgements.map((judgement) => (
                <JudgementCard
                  judgement={judgement}
                  key={`${judgement.title}-${judgement.value}`}
                />
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
            <h3 className="text-lg font-semibold">Insights</h3>
            <div className="mt-4 grid gap-3">
              {dashboard.insights.map((insight) => (
                <InsightCard insight={insight} key={insight.title} />
              ))}
            </div>
          </article>
        </div>
      </div>

      <TransactionsPanel transactions={dashboard.recentTransactions} />
    </section>
  );
}
