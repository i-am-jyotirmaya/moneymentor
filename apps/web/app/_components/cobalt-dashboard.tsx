import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Flag,
  MessagesSquare,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { CategorySpendSummary, MonthlyDashboardResponse } from "@/lib/api";
import {
  EmptyInline,
  InsightCard,
  JudgementCard,
  MonthNavigator,
  TransactionRow,
} from "./common-ui";
import { ProgressLink as Link } from "./navigation-progress";
import { formatMoney } from "./workspace-format";
import styles from "./cobalt-dashboard.module.css";

function signedMoney(value: number, currency: string, positiveSign = true) {
  const sign = value < 0 ? "−" : value > 0 && positiveSign ? "+" : "";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

function percentText(value: number) {
  return `${value < 0 ? "−" : ""}${Math.abs(value)}%`;
}

function DashboardHero({ dashboard }: { dashboard: MonthlyDashboardResponse }) {
  const { currencyCode, income, monthLabel, saved, savingsRate, spends } = dashboard;
  const kept = Math.max(0, Math.min(100, savingsRate ?? 0));

  return (
    <article className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{monthLabel}</p>
        <h2>Net kept</h2>
        <p className={styles.balance}>{signedMoney(saved, currencyCode)}</p>
      </div>
      <div className={styles.gauge} style={{ "--kept": `${kept}%` } as CSSProperties}>
        <div className={styles.gaugeRing} aria-hidden="true" />
        <p className={styles.gaugeLabel}>
          <strong>{savingsRate === null ? "—" : percentText(savingsRate)}</strong>
          <span>{savingsRate === null ? "No income" : savingsRate < 0 ? "Deficit" : "Kept"}</span>
        </p>
      </div>
      <dl className={styles.flows}>
        <div>
          <ArrowDownLeft aria-hidden="true" />
          <dt>Income</dt>
          <dd>{signedMoney(income, currencyCode)}</dd>
        </div>
        <div>
          <ArrowUpRight aria-hidden="true" />
          <dt>Spends</dt>
          <dd>{signedMoney(-spends, currencyCode)}</dd>
        </div>
      </dl>
    </article>
  );
}

function categoryColorSlots(categories: CategorySpendSummary[]) {
  const names = Array.from(new Set(categories.map((category) => category.name))).sort();
  const slots = new Map<string, number>();
  const used = new Set<number>();
  const slotCount = 6;

  for (const name of names) {
    let hash = 0;
    for (const letter of name) {
      hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
    }
    let slot = hash % slotCount;
    while (used.has(slot) && used.size < slotCount) {
      slot = (slot + 1) % slotCount;
    }
    slots.set(name, slot + 1);
    used.add(slot);
  }
  return slots;
}

function CategoryBreakdown({ dashboard }: { dashboard: MonthlyDashboardResponse }) {
  const { categories, currencyCode, spends } = dashboard;
  const sorted = [...categories].sort((left, right) => right.amount - left.amount);
  const positive = sorted.filter((category) => category.amount > 0);
  const grouped = positive.length > 6;
  const shown = grouped ? positive.slice(0, 5) : positive;
  const slots = categoryColorSlots(shown);
  const otherAmount = grouped ? positive.slice(5).reduce((sum, category) => sum + category.amount, 0) : 0;
  const segments = shown.map((category) => ({
    amount: category.amount,
    color: `var(--sp-cat-${slots.get(category.name)})`,
  }));
  if (otherAmount > 0) {
    segments.push({ amount: otherAmount, color: "var(--category-other)" });
  }
  const chartTotal = segments.reduce((sum, segment) => sum + segment.amount, 0);
  // A share cannot faithfully represent a negative category balance from refunds.
  const showDonut = spends > 0 && chartTotal > 0 && sorted.every((category) => category.amount >= 0);
  const stops = [];
  let start = 0;
  for (const [index, { amount, color }] of segments.entries()) {
    const end = index === segments.length - 1 ? 100 : start + (amount / chartTotal) * 100;
    stops.push(`${color} ${start}% ${end}%`);
    start = end;
  }

  return (
    <article className={styles.card}>
      <h2>Where it went</h2>
      {sorted.length === 0 ? (
        <EmptyInline text="No spending recorded for this month yet." />
      ) : (
        <div className={styles.breakdown}>
          {showDonut ? (
            <div className={styles.donut} style={{ "--slices": stops.join(", ") } as CSSProperties}>
              <div className={styles.donutRing} aria-hidden="true" />
              <p><span>Spent</span><strong>{formatMoney(spends, currencyCode)}</strong></p>
            </div>
          ) : null}
          <table className={styles.categories}>
            <caption className="sr-only">Spending by category</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                {showDonut ? <th scope="col">Share</th> : null}
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((category, index) => {
                const slot = slots.get(category.name);
                const share = category.amount / chartTotal * 100;
                return (
                  <tr key={`${category.name}-${category.classification}-${index}`}>
                    <th scope="row">
                      <span className={styles.categoryName}>
                        {showDonut && category.amount > 0 ? (
                          <span
                            className={slot ? styles.swatch : `${styles.swatch} ${styles.otherSwatch}`}
                            style={slot ? { backgroundColor: `var(--sp-cat-${slot})` } : undefined}
                            aria-hidden="true"
                          />
                        ) : null}
                        {category.name}
                      </span>
                      {category.note ? (
                        <span className={styles.categoryNote}>{category.note}</span>
                      ) : null}
                    </th>
                    {showDonut ? <td>{share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`}</td> : null}
                    <td>{signedMoney(category.amount, currencyCode, false)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function CobaltDashboard({
  dashboard,
  household,
  isLoading,
  month,
  onMonthChange,
}: {
  dashboard: MonthlyDashboardResponse;
  household: string | null;
  isLoading: boolean;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  function route(path: string, values: Record<string, string> = {}) {
    const params = new URLSearchParams(values);
    if (household) params.set("household", household);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  const actions = [
    { label: "Add", icon: Plus, href: route("/assistant", { compose: "add" }), primary: true },
    { label: "Ask", icon: MessagesSquare, href: route("/assistant", { compose: "ask" }) },
    { label: "Goals", icon: Flag, href: route("/planning") },
    { label: "Judgments", icon: ShieldCheck, href: route("/reports") },
  ];

  return (
    <section aria-busy={isLoading} className={`min-h-full overflow-y-auto px-4 py-4 lg:px-0 lg:py-0 ${styles.dashboard}`}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className="hidden lg:block">Dashboard</h1>
          <div className={styles.month}>
            <MonthNavigator disabled={isLoading} label="Dashboard month" month={month} onMonthChange={onMonthChange} />
          </div>
        </header>

        <DashboardHero dashboard={dashboard} />

        <nav aria-label="Dashboard actions" className={styles.actions}>
          {actions.map(({ label, icon: Icon, href, primary }) => (
            <Link key={label} href={href} className={`${styles.action} ${primary ? styles.primaryAction : ""}`}>
              <span className={styles.actionIcon}><Icon aria-hidden="true" /></span>
              {label}
            </Link>
          ))}
        </nav>

        <div className={styles.panels}>
          <CategoryBreakdown dashboard={dashboard} />
          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>Recent transactions</h2>
              <Link className={styles.viewAll} href={route("/transactions", { month: dashboard.month })}>
                View all <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            {dashboard.recentTransactions.length > 0 ? (
              <div className="divide-y divide-[var(--border)]">
                {dashboard.recentTransactions.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} compact />
                ))}
              </div>
            ) : (
              <EmptyInline text="Try “Spent 450 on groceries” in Assistant to log your first transaction." />
            )}
          </article>
          {dashboard.judgements.length > 0 ? (
            <article className={styles.card}>
              <h2>Judgments</h2>
              <div className={styles.notes}>
                {dashboard.judgements.map((judgement) => (
                  <JudgementCard judgement={judgement} key={judgement.id ?? `${judgement.title}-${judgement.value}`} />
                ))}
              </div>
            </article>
          ) : null}
          {dashboard.insights.length > 0 ? (
            <article className={styles.card}>
              <h2>Insights</h2>
              <div className={styles.notes}>
                {dashboard.insights.map((insight) => <InsightCard insight={insight} key={insight.title} />)}
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
