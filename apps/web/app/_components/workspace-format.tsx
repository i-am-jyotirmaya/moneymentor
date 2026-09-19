import type {
  AssistantMessageResponse,
  DashboardJudgement,
  TransactionListItem,
  UserSettingsResponse,
} from "@/lib/api";
import { type TransactionEditForm } from "../_hooks/use-transaction-state";
import { SettingsForm } from "./workspace-types";

export function getFallbackAssistantMessage(result: AssistantMessageResponse) {
  if (result.status === "NeedsClarification") {
    return "I need a little more detail before saving this.";
  }

  if (result.transaction) {
    return "Tracked that expense.";
  }

  return "I could not handle that message yet.";
}

export function toneClass(tone: DashboardJudgement["tone"]) {
  if (tone === "Healthy") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (tone === "Watch") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

export function formatTone(tone: DashboardJudgement["tone"]) {
  return tone.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatMoney(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      currency: currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function looksLikeFinanceQuestion(text: string) {
  return /\b(where|what|which|how much|spent most|total|summary|report)\b/i.test(
    text,
  );
}

export function shiftMonthKey(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function formatMonthKey(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function getMonthOptions(selectedMonth: string) {
  const currentMonth = getCurrentMonthKey();
  const options = new Set(
    Array.from({ length: 36 }, (_, index) =>
      shiftMonthKey(currentMonth, -index),
    ),
  );
  options.add(selectedMonth);
  return Array.from(options).sort((left, right) => right.localeCompare(left));
}

export function toSettingsForm(settings: UserSettingsResponse): SettingsForm {
  return {
    currencyCode: settings.currencyCode,
    timeZone: settings.timeZone,
    plan: settings.plan,
    requireMerchantForExpenses: settings.requireMerchantForExpenses,
    defaultTransactionVisibility: settings.defaultTransactionVisibility,
  };
}

export function toTransactionEditForm(
  transaction: TransactionListItem,
): TransactionEditForm {
  return {
    amount: transaction.amount.toString(),
    categoryName: transaction.categoryName ?? "",
    merchantName: transaction.merchantName ?? "",
    description: transaction.description ?? "",
    senderName: transaction.senderName ?? "",
    reason: transaction.reason ?? "",
    transactionDate: transaction.transactionDate.slice(0, 10),
    visibility: transaction.visibility,
  };
}
