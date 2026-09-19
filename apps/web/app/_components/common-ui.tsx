"use client";

import type {
  CategorySpendSummary,
  DashboardInsight,
  DashboardJudgement,
  TransactionListItem,
} from "@/lib/api";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { ReactNode, useMemo } from "react";
import {
  formatDate,
  formatMoney,
  formatMonthKey,
  formatTone,
  getCurrentMonthKey,
  getMonthOptions,
  shiftMonthKey,
  toneClass,
} from "./workspace-format";

export function MetricCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof Bot;
  label: string;
  tone: "income" | "spend" | "saved" | "neutral";
  value: string;
}) {
  const toneClassName = {
    income: "bg-emerald-50 text-emerald-700",
    neutral: "bg-slate-100 text-slate-700",
    saved: "bg-[var(--accent-soft)] text-[var(--accent)]",
    spend: "bg-rose-50 text-rose-700",
  }[tone];

  return (
    <article className="rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-lg ${toneClassName}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-xs font-semibold uppercase text-[var(--muted)]">
          {label}
        </span>
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-sm font-medium text-[var(--muted)]">{detail}</p>
    </article>
  );
}

export function CategoryRow({
  category,
  currencyCode,
  total,
}: {
  category: CategorySpendSummary;
  currencyCode: string;
  total: number;
}) {
  const percent = total > 0 ? Math.round((category.amount / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{category.name}</p>
          <p className="mt-1 text-xs font-medium text-[var(--muted)]">
            {category.note}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold">
            {formatMoney(category.amount, currencyCode)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {percent}%
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function JudgementCard({
  judgement,
}: {
  judgement: DashboardJudgement;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold ${toneClass(judgement.tone)}`}
        >
          {formatTone(judgement.tone)}
        </span>
        <span className="text-sm font-bold">{judgement.value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{judgement.title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted)]">
        {judgement.text}
      </p>
    </div>
  );
}

export function InsightCard({ insight }: { insight: DashboardInsight }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-sm font-semibold">{insight.title}</p>
      <p className="mt-1 text-sm font-medium leading-6 text-[var(--muted)]">
        {insight.text}
      </p>
    </div>
  );
}

export function TransactionsPanel({
  transactions,
}: {
  transactions: TransactionListItem[];
}) {
  return (
    <article className="mt-5 rounded-lg border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Recent transactions</h3>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            Your latest expenses and income.
          </p>
        </div>
        <ReceiptText className="h-5 w-5 text-[var(--accent)]" />
      </div>
      <div className="mt-4 divide-y divide-[var(--border)]">
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))
        ) : (
          <EmptyInline text="No transactions yet. Try tracking an expense or income in the assistant." />
        )}
      </div>
    </article>
  );
}

export function TransactionRow({
  canWrite = true,
  compact = false,
  onDelete,
  onEdit,
  transaction,
}: {
  canWrite?: boolean;
  compact?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  transaction: TransactionListItem;
}) {
  const isIncome = transaction.type === "Income";
  const transactionLabel = isIncome
    ? (transaction.reason ??
      (transaction.senderName
        ? `Income from ${transaction.senderName}`
        : transaction.sourceText))
    : (transaction.description ??
      transaction.merchantName ??
      transaction.sourceText);

  return (
    <article
      className={`flex items-center justify-between gap-3 ${compact ? "py-3" : "py-4"}`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold">{transactionLabel}</p>
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${isIncome ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}
          >
            {transaction.type}
          </span>
        </div>
        <p className="mt-1 truncate text-xs font-medium text-[var(--muted)]">
          {transaction.categoryName ?? "Uncategorized"}
          {isIncome && transaction.senderName
            ? ` - From ${transaction.senderName}`
            : ""}
          {!isIncome && transaction.merchantName
            ? ` - ${transaction.merchantName}`
            : ""}
          {" - "}
          {formatDate(transaction.transactionDate)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <p
          className={`text-sm font-bold ${isIncome ? "text-emerald-700" : "text-[var(--ink)]"}`}
        >
          {isIncome ? "+" : "-"}
          {formatMoney(transaction.amount, transaction.currencyCode)}
        </p>
        {onEdit ? (
          <button
            aria-label={`Edit transaction ${transactionLabel}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            disabled={!canWrite}
            onClick={onEdit}
            title="Edit transaction"
            type="button"
          >
            <Pencil className="h-4 w-4" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            aria-label={`Delete transaction ${transactionLabel}`}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canWrite}
            onClick={onDelete}
            title={canWrite ? "Move to trash" : "Viewer access is read-only"}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function PreferenceToggle({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-24 cursor-pointer items-start justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <span>
        <span className="block text-sm font-semibold text-[var(--ink)]">
          {label}
        </span>
        <span className="mt-2 block text-sm font-medium leading-6 text-[var(--muted)]">
          {description}
        </span>
      </span>
      <input
        checked={checked}
        className="toggle-control"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

export function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-[var(--ink)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({
  icon: Icon,
  text,
  title,
}: {
  icon: typeof Bot;
  text: string;
  title: string;
}) {
  return (
    <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
      <div>
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-white text-[var(--accent)] shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold">{title}</p>
        <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-[var(--muted)]">
          {text}
        </p>
      </div>
    </div>
  );
}

export function EmptyInline({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-4 text-center text-sm font-medium leading-6 text-[var(--muted)]">
      {text}
    </p>
  );
}

export function MonthNavigator({
  disabled,
  label,
  month,
  onMonthChange,
}: {
  disabled: boolean;
  label: string;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const monthOptions = useMemo(() => getMonthOptions(month), [month]);
  const nextMonth = shiftMonthKey(month, 1);
  const currentMonth = getCurrentMonthKey();

  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white p-1 shadow-sm">
      <button
        aria-label={`Previous ${label.toLowerCase()}`}
        className="grid h-9 w-9 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-45"
        disabled={disabled}
        onClick={() => onMonthChange(shiftMonthKey(month, -1))}
        type="button"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        aria-label={label}
        className="h-9 min-w-36 bg-transparent px-2 text-sm font-semibold outline-none disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => onMonthChange(event.target.value)}
        value={month}
      >
        {monthOptions.map((option) => (
          <option key={option} value={option}>
            {formatMonthKey(option)}
          </option>
        ))}
      </select>
      <button
        aria-label={`Next ${label.toLowerCase()}`}
        className="grid h-9 w-9 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:opacity-45"
        disabled={disabled || nextMonth > currentMonth}
        onClick={() => onMonthChange(nextMonth)}
        type="button"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SidebarStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-white/58">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}
