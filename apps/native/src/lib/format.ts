export function formatTone(tone: string) {
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
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

type InrOptions = { sign?: "auto" | "always" | "never"; compact?: boolean };

const inrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const compactInrDigits = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const inrUnits = [
  { threshold: 10_000_000, suffix: "Cr" },
  { threshold: 100_000, suffix: "L" },
  { threshold: 1_000, suffix: "K" },
];

export function formatInr(value: number, opts?: InrOptions): string {
  let sign = "";
  if (value < 0 && opts?.sign !== "never") sign = "−";
  if (value > 0 && opts?.sign === "always") sign = "+";

  const amount = Math.abs(value);
  const unit = opts?.compact ? inrUnits.find(({ threshold }) => amount >= threshold) : undefined;
  const digits = unit
    ? compactInrDigits.format(amount / unit.threshold) + unit.suffix
    : inrDigits.format(amount);
  return `${sign}₹${digits}`;
}

export function spokenInr(value: number, opts?: InrOptions): string {
  const formatted = formatInr(value, opts);
  if (formatted.startsWith("−")) return `minus ${formatted.slice(1)}`;
  if (formatted.startsWith("+")) return `plus ${formatted.slice(1)}`;
  return formatted;
}

const percentDigits = new Intl.NumberFormat("en-IN", { useGrouping: false, maximumFractionDigits: 1 });

export function formatPercent(value: number, opts?: { sign?: "auto" | "always" | "never" }): string {
  const digits = percentDigits.format(Math.abs(value));
  let sign = "";
  if (digits !== "0" && value < 0 && opts?.sign !== "never") sign = "−";
  if (digits !== "0" && value > 0 && opts?.sign === "always") sign = "+";
  return `${sign}${digits}%`;
}

export function spokenPercent(value: number): string {
  const digits = formatPercent(value).slice(0, -1);
  return `${digits.startsWith("−") ? `minus ${digits.slice(1)}` : digits} percent`;
}
